package nodesurvival.ui;

import javafx.scene.canvas.GraphicsContext;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import nodesurvival.model.GameState;
import nodesurvival.model.NodePoint;
import nodesurvival.model.Player;
import nodesurvival.systems.ArenaManager;
import nodesurvival.systems.GameManager;
import nodesurvival.util.Constants;

import java.util.List;

/** Draws the whole scene and HUD each frame from the GameManager's current state. */
public class Renderer {

    public void render(GraphicsContext gc, GameManager gm, double width, double height) {
        gc.setFill(Color.web("#12141c"));
        gc.fillRect(0, 0, width, height);

        ArenaManager arena = gm.getArenaManager();
        List<NodePoint> nodes = arena.getNodes();

        drawArenaOutline(gc, nodes);
        drawCenterZone(gc);
        drawNodes(gc, gm, nodes);
        drawPlayers(gc, gm);
        drawHud(gc, gm, width, height);
    }

    private void drawArenaOutline(GraphicsContext gc, List<NodePoint> nodes) {
        if (nodes.size() < 3) return;
        double[] xs = new double[nodes.size()];
        double[] ys = new double[nodes.size()];
        for (int i = 0; i < nodes.size(); i++) {
            xs[i] = nodes.get(i).x;
            ys[i] = nodes.get(i).y;
        }
        gc.setStroke(Color.web("#33415c"));
        gc.setLineWidth(2);
        gc.strokePolygon(xs, ys, nodes.size());
    }

    private void drawCenterZone(GraphicsContext gc) {
        double cr = Constants.CENTER_RADIUS;
        double cx = Constants.ARENA_CENTER_X;
        double cy = Constants.ARENA_CENTER_Y;
        gc.setFill(Color.web("#f4c542", 0.18));
        gc.setStroke(Color.web("#f4c542"));
        gc.fillOval(cx - cr, cy - cr, cr * 2, cr * 2);
        gc.strokeOval(cx - cr, cy - cr, cr * 2, cr * 2);
        gc.setFill(Color.web("#f4c542"));
        gc.setFont(Font.font(12));
        gc.fillText("CENTER", cx - 22, cy);
    }

    private void drawNodes(GraphicsContext gc, GameManager gm, List<NodePoint> nodes) {
        double r = Constants.NODE_RADIUS;
        for (NodePoint n : nodes) {
            if (!n.active) {
                gc.setFill(Color.web("#2a2f3a"));
                gc.setStroke(Color.web("#40465a"));
            } else if (n.occupiedBy != null) {
                Player occ = findPlayer(gm, n.occupiedBy);
                gc.setFill(occ != null ? occ.color.deriveColor(0, 1, 1, 0.35) : Color.GRAY);
                gc.setStroke(occ != null ? occ.color : Color.WHITE);
            } else {
                gc.setFill(Color.web("#2ecc71", 0.25));
                gc.setStroke(Color.web("#2ecc71"));
            }
            gc.setLineWidth(2);
            gc.fillOval(n.x - r, n.y - r, r * 2, r * 2);
            gc.strokeOval(n.x - r, n.y - r, r * 2, r * 2);
        }
    }

    private void drawPlayers(GraphicsContext gc, GameManager gm) {
        double r = Constants.PLAYER_RADIUS;
        for (Player p : gm.getPlayers()) {
            if (!p.alive) continue;

            gc.setFill(p.color);
            gc.fillOval(p.x - r, p.y - r, r * 2, r * 2);
            gc.setStroke(Color.WHITE);
            gc.setLineWidth(1.5);
            gc.strokeOval(p.x - r, p.y - r, r * 2, r * 2);

            double barW = 30, barH = 4;
            double hx = p.x - barW / 2, hy = p.y - r - 10;
            gc.setFill(Color.web("#333"));
            gc.fillRect(hx, hy, barW, barH);
            double pct = p.heart / Constants.MAX_HEART;
            gc.setFill(pct > 0.4 ? Color.web("#2ecc71") : Color.web("#e74c3c"));
            gc.fillRect(hx, hy, barW * pct, barH);
        }
    }

    private void drawHud(GraphicsContext gc, GameManager gm, double width, double height) {
        gc.setFill(Color.web("#e6e6e6"));
        gc.setFont(Font.font(16));

        String stateLabel = switch (gm.getState()) {
            case MENU -> "MENU";
            case COUNTDOWN -> "GET READY: " + String.format("%.1f", Math.max(0, gm.getStateTimer()));
            case ROUND_ACTIVE -> "ALIVE: " + gm.getAliveCount();
            case ARENA_TRANSITION -> "ARENA SHRINKING...";
            case GAME_OVER -> "WINNER: " + gm.getWinnerName();
        };
        gc.fillText(stateLabel, 16, 24);

        Player human = gm.getHuman();
        if (human != null) {
            gc.setFont(Font.font(13));
            gc.setFill(Color.web("#cfd8dc"));
            gc.fillText(String.format("Heart: %.0f   Zone: %s   Exposure: %.1fs   Stress: %.2fx",
                    human.heart, human.currentZone, human.exposureTime, human.stress), 16, 46);
        }

        gc.setFont(Font.font(11));
        double y = 68;
        for (Player p : gm.getPlayers()) {
            String status = p.alive
                    ? String.format("%s: %.0f HP (%s)", p.name, p.heart, p.currentZone)
                    : (p.name + ": OUT");
            gc.setFill(p.alive ? p.color : Color.web("#666"));
            gc.fillText(status, 16, y);
            y += 15;
        }

        if (gm.getState() == GameState.GAME_OVER) {
            gc.setFill(Color.web("#000000", 0.55));
            gc.fillRect(0, 0, width, height);
            gc.setFill(Color.WHITE);
            gc.setFont(Font.font(30));
            gc.fillText("Winner: " + gm.getWinnerName(), width / 2 - 100, height / 2);
            gc.setFont(Font.font(14));
            gc.fillText("Press R to restart", width / 2 - 60, height / 2 + 30);
        }
    }

    private Player findPlayer(GameManager gm, String id) {
        for (Player p : gm.getPlayers()) {
            if (p.id.equals(id)) return p;
        }
        return null;
    }
}
