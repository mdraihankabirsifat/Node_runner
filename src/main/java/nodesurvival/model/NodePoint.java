package nodesurvival.model;

/** Matches the doc's section 8.3 nodePoint shape. */
public class NodePoint {
    public final String id;
    public double x, y;
    public boolean active = true;
    public String occupiedBy = null; // player id, or null if vacant

    public NodePoint(String id, double x, double y) {
        this.id = id;
        this.x = x;
        this.y = y;
    }
}
