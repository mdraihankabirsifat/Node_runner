package nodesurvival.model;

import javafx.scene.paint.Color;

/**
 * Matches the doc's section 8.3 player shape, plus JavaFX-specific extras
 * (color for rendering, bot FSM state/target).
 */
public class Player {
    public final String id;
    public final String name;
    public final Color color;
    public final boolean isBot;

    public double x, y;
    public double heart = 100.0;
    public double exposureTime = 0.0;
    public double stress = 1.0;
    public Zone currentZone = Zone.FIELD;
    public String currentNodeId = null;
    public String lastActivatedNodeId = null;
    public boolean alive = true;

    // Anti same-node-reentry exploit tracking (doc section 3.5).
    public String lockedNodeId = null;
    public double lockUntil = 0.0;

    // Bot FSM (doc section 7.1).
    public String botState = "SEEK_NODE";
    public double targetX, targetY;

    public Player(String id, String name, Color color, boolean isBot, double x, double y) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.isBot = isBot;
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }
}
