package nodesurvival.systems;

import nodesurvival.model.NodePoint;
import nodesurvival.model.Player;
import nodesurvival.util.Constants;

import java.util.List;

/**
 * Lightweight finite-state-machine bot behavior, per the doc's section 7.1
 * recommendation ("direct steering toward target points" rather than
 * pathfinding). Mirrors the doc's chooseBotGoal pseudocode.
 */
public class BotSystem {

    public void updateBotGoal(Player bot, List<NodePoint> nodes, List<Player> allPlayers, double simTime) {
        NodePoint best = null;
        double bestDist = Double.MAX_VALUE;
        boolean seekingNode = bot.heart < 45 || bot.exposureTime > 35;

        if (seekingNode) {
            for (NodePoint n : nodes) {
                if (!n.active || n.occupiedBy != null) continue;
                boolean lockedOut = bot.lockedNodeId != null
                        && bot.lockedNodeId.equals(n.id)
                        && simTime < bot.lockUntil;
                if (lockedOut) continue;

                double dx = n.x - bot.x;
                double dy = n.y - bot.y;
                double d = dx * dx + dy * dy;
                if (d < bestDist) {
                    bestDist = d;
                    best = n;
                }
            }
        }

        if (best != null) {
            bot.targetX = best.x;
            bot.targetY = best.y;
            bot.botState = "SEEK_NODE";
            return;
        }

        if (bot.heart < 30) {
            bot.targetX = Constants.ARENA_CENTER_X;
            bot.targetY = Constants.ARENA_CENTER_Y;
            bot.botState = "RECOVER_CENTER";
            return;
        }

        // INTERCEPT: predict the soonest-to-vacate occupied node (lowest occupant heart).
        NodePoint predicted = null;
        double lowestHeart = Double.MAX_VALUE;
        for (NodePoint n : nodes) {
            if (!n.active || n.occupiedBy == null) continue;
            Player occupant = findPlayer(allPlayers, n.occupiedBy);
            if (occupant != null && occupant.heart < lowestHeart) {
                lowestHeart = occupant.heart;
                predicted = n;
            }
        }

        if (predicted != null) {
            bot.targetX = predicted.x;
            bot.targetY = predicted.y;
            bot.botState = "INTERCEPT";
        } else {
            bot.targetX = Constants.ARENA_CENTER_X;
            bot.targetY = Constants.ARENA_CENTER_Y;
            bot.botState = "ROTATE";
        }
    }

    public void moveToward(Player p, double dt) {
        double dx = p.targetX - p.x;
        double dy = p.targetY - p.y;
        double dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) return;

        double step = Math.min(dist, Constants.PLAYER_SPEED * dt);
        p.x += dx / dist * step;
        p.y += dy / dist * step;
    }

    private Player findPlayer(List<Player> players, String id) {
        for (Player p : players) {
            if (p.id.equals(id)) return p;
        }
        return null;
    }
}
