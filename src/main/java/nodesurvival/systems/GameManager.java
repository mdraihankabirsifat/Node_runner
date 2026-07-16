package nodesurvival.systems;

import javafx.scene.paint.Color;
import nodesurvival.model.GameState;
import nodesurvival.model.NodePoint;
import nodesurvival.model.Player;
import nodesurvival.model.Zone;
import nodesurvival.util.Constants;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Central per-frame game logic. Combines the responsibilities the doc
 * splits across GameManager / ZoneSystem / EliminationSystem for this
 * minimal single-file-per-concern prototype.
 */
public class GameManager {

    private static final Color[] PALETTE = {
            Color.web("#e74c3c"), Color.web("#9b59b6"), Color.web("#3498db"),
            Color.web("#1abc9c"), Color.web("#2c3e50"), Color.web("#f39c12"),
            Color.web("#2ecc71"), Color.web("#e67e22"), Color.web("#16a085")
    };

    private final ArenaManager arenaManager = new ArenaManager();
    private final BotSystem botSystem = new BotSystem();
    private final List<Player> players = new ArrayList<>();

    private GameState state = GameState.MENU;
    private double simTime = 0.0;
    private double stateTimer = 0.0;
    private String winnerName = null;
    private int initialPlayerCount = 4;

    public void startNewMatch(int totalPlayers) {
        this.initialPlayerCount = Math.max(3, totalPlayers);
        players.clear();
        winnerName = null;
        simTime = 0.0;

        for (int i = 0; i < initialPlayerCount; i++) {
            boolean bot = i != 0;
            String id = "p" + (i + 1);
            String name = bot ? ("Bot " + (i + 1)) : "You";
            double jx = Constants.ARENA_CENTER_X + (Math.random() * 40 - 20);
            double jy = Constants.ARENA_CENTER_Y + (Math.random() * 40 - 20);
            players.add(new Player(id, name, PALETTE[i % PALETTE.length], bot, jx, jy));
        }

        arenaManager.rebuild(players.size());
        state = GameState.COUNTDOWN;
        stateTimer = Constants.COUNTDOWN_SECONDS;
    }

    public void tick(double dt, double moveX, double moveY) {
        simTime += dt;
        switch (state) {
            case COUNTDOWN -> tickCountdown(dt);
            case ROUND_ACTIVE -> tickRound(dt, moveX, moveY);
            case ARENA_TRANSITION -> tickTransition(dt);
            case GAME_OVER, MENU -> { /* no-op */ }
        }
    }

    private void tickCountdown(double dt) {
        stateTimer -= dt;
        if (stateTimer <= 0) {
            state = GameState.ROUND_ACTIVE;
        }
    }

    private void tickRound(double dt, double moveX, double moveY) {
        Player human = getHuman();
        if (human != null && human.alive) {
            double len = Math.sqrt(moveX * moveX + moveY * moveY);
            if (len > 0.001) {
                human.x += (moveX / len) * Constants.PLAYER_SPEED * dt;
                human.y += (moveY / len) * Constants.PLAYER_SPEED * dt;
            }
            clampToArena(human);
        }

        for (Player p : players) {
            if (!p.alive || !p.isBot) continue;
            botSystem.updateBotGoal(p, arenaManager.getNodes(), players, simTime);
            botSystem.moveToward(p, dt);
            clampToArena(p);
        }

        for (Player p : players) {
            if (!p.alive) continue;
            resolveZone(p);
            applyZoneEffects(p, dt);
        }

        List<Player> eliminatedNow = new ArrayList<>();
        for (Player p : players) {
            if (p.alive && p.heart <= 0) {
                p.alive = false;
                p.heart = 0;
                releaseIfOccupying(p);
                eliminatedNow.add(p);
            }
        }

        if (!eliminatedNow.isEmpty()) {
            long aliveCount = players.stream().filter(p -> p.alive).count();
            if (aliveCount <= 1) {
                state = GameState.GAME_OVER;
                Optional<Player> winner = players.stream().filter(p -> p.alive).findFirst();
                winnerName = winner.map(p -> p.name).orElse("No one");
            } else {
                // Fairness rule (doc 5.2): release occupations & freeze before rebuilding.
                state = GameState.ARENA_TRANSITION;
                stateTimer = Constants.TRANSITION_SECONDS;
                arenaManager.releaseAllOccupations();
                for (Player p : players) {
                    if (p.alive) {
                        p.currentZone = Zone.FIELD;
                        p.currentNodeId = null;
                    }
                }
            }
        }
    }

    private void tickTransition(double dt) {
        stateTimer -= dt;
        if (stateTimer <= 0) {
            long aliveCount = players.stream().filter(p -> p.alive).count();
            arenaManager.rebuild((int) aliveCount);
            for (Player p : players) {
                if (p.alive) {
                    p.x = Constants.ARENA_CENTER_X + (Math.random() * 60 - 30);
                    p.y = Constants.ARENA_CENTER_Y + (Math.random() * 60 - 30);
                }
            }
            state = GameState.COUNTDOWN;
            stateTimer = Constants.COUNTDOWN_SECONDS * 0.6;
        }
    }

    private void resolveZone(Player p) {
        NodePoint node = arenaManager.findNodeAt(p.x, p.y);
        boolean inCenter = arenaManager.isInCenter(p.x, p.y);

        if (node != null) {
            boolean lockedOut = p.lockedNodeId != null
                    && p.lockedNodeId.equals(node.id)
                    && simTime < p.lockUntil;

            if (!lockedOut) {
                if (node.occupiedBy == null) {
                    node.occupiedBy = p.id;
                    p.currentNodeId = node.id;
                    p.currentZone = Zone.NODE;
                    p.heart = Constants.MAX_HEART;
                    p.lastActivatedNodeId = node.id;
                    return;
                } else if (node.occupiedBy.equals(p.id)) {
                    p.currentZone = Zone.NODE;
                    p.currentNodeId = node.id;
                    return;
                }
            }
            // Occupied by someone else, or this player is locked out of it: treat as field/center.
            leaveNodeIfNeeded(p);
            p.currentZone = inCenter ? Zone.CENTER : Zone.FIELD;
            return;
        }

        leaveNodeIfNeeded(p);
        p.currentZone = inCenter ? Zone.CENTER : Zone.FIELD;
    }

    private void leaveNodeIfNeeded(Player p) {
        if (p.currentNodeId != null) {
            NodePoint prev = findNode(p.currentNodeId);
            if (prev != null && p.id.equals(prev.occupiedBy)) {
                prev.occupiedBy = null;
            }
            p.lockedNodeId = p.currentNodeId;
            p.lockUntil = simTime + Constants.SAME_NODE_LOCKOUT_SECONDS;
            p.currentNodeId = null;
        }
    }

    private void releaseIfOccupying(Player p) {
        if (p.currentNodeId != null) {
            NodePoint n = findNode(p.currentNodeId);
            if (n != null && p.id.equals(n.occupiedBy)) {
                n.occupiedBy = null;
            }
            p.currentNodeId = null;
        }
    }

    private NodePoint findNode(String id) {
        for (NodePoint n : arenaManager.getNodes()) {
            if (n.id.equals(id)) return n;
        }
        return null;
    }

    private void applyZoneEffects(Player p, double dt) {
        p.stress = 1 + Math.min(p.exposureTime / Constants.EXPOSURE_STRESS_DIVISOR, Constants.STRESS_CAP);

        switch (p.currentZone) {
            case NODE -> p.heart -= Constants.NODE_DRAIN_PER_SEC * dt; // timer paused
            case CENTER -> {
                p.heart += (Constants.CENTER_RECOVERY_PER_SEC / p.stress) * dt;
                p.exposureTime += dt;
            }
            case FIELD -> {
                p.heart -= (Constants.FIELD_DRAIN_PER_SEC * p.stress) * dt;
                p.exposureTime += dt;
            }
        }
        p.heart = Math.max(0, Math.min(Constants.MAX_HEART, p.heart));
    }

    private void clampToArena(Player p) {
        double dx = p.x - Constants.ARENA_CENTER_X;
        double dy = p.y - Constants.ARENA_CENTER_Y;
        double dist = Math.sqrt(dx * dx + dy * dy);
        double maxDist = Constants.ARENA_LAYOUT_RADIUS + 40;
        if (dist > maxDist) {
            p.x = Constants.ARENA_CENTER_X + dx / dist * maxDist;
            p.y = Constants.ARENA_CENTER_Y + dy / dist * maxDist;
        }
    }

    public Player getHuman() {
        for (Player p : players) {
            if (!p.isBot) return p;
        }
        return null;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public ArenaManager getArenaManager() {
        return arenaManager;
    }

    public GameState getState() {
        return state;
    }

    public double getStateTimer() {
        return stateTimer;
    }

    public String getWinnerName() {
        return winnerName;
    }

    public long getAliveCount() {
        return players.stream().filter(p -> p.alive).count();
    }
}
