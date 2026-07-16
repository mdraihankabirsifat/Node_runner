package nodesurvival.systems;

import nodesurvival.model.NodePoint;
import nodesurvival.util.Constants;

import java.util.ArrayList;
import java.util.List;

/**
 * Handles the polygon arena and its corner nodes.
 *
 * Geometry vs. active-node count follows the doc's section 5.2 table:
 *   cornerCount  = max(3, aliveCount - 1)
 *   activeCount  = max(0, aliveCount - 1)
 * Once aliveCount drops to 4 or below, cornerCount stays at 3 (a triangle)
 * while activeCount keeps shrinking (3 -> 2 -> 1 -> 0), which reproduces
 * the doc's "triangle with two/one active corner node" final-round cases.
 *
 * Only the polygon arena type is implemented here (football-pitch and
 * circular arenas are listed in the doc as later additions).
 */
public class ArenaManager {

    private final List<NodePoint> nodes = new ArrayList<>();
    private int cornerCount;
    private int activeCount;

    public void rebuild(int aliveCount) {
        cornerCount = Math.max(3, aliveCount - 1);
        activeCount = Math.max(0, aliveCount - 1);

        nodes.clear();
        for (int i = 0; i < cornerCount; i++) {
            double angle = -Math.PI / 2 + (2 * Math.PI * i) / cornerCount;
            double x = Constants.ARENA_CENTER_X + Constants.ARENA_LAYOUT_RADIUS * Math.cos(angle);
            double y = Constants.ARENA_CENTER_Y + Constants.ARENA_LAYOUT_RADIUS * Math.sin(angle);
            NodePoint n = new NodePoint("n" + (i + 1), x, y);
            n.active = i < activeCount;
            nodes.add(n);
        }
    }

    public List<NodePoint> getNodes() {
        return nodes;
    }

    public int getCornerCount() {
        return cornerCount;
    }

    public int getActiveCount() {
        return activeCount;
    }

    /** Returns the active node whose radius contains (x, y), or null. */
    public NodePoint findNodeAt(double x, double y) {
        for (NodePoint n : nodes) {
            if (!n.active) continue;
            double dx = x - n.x;
            double dy = y - n.y;
            if (dx * dx + dy * dy <= Constants.NODE_RADIUS * Constants.NODE_RADIUS) {
                return n;
            }
        }
        return null;
    }

    public boolean isInCenter(double x, double y) {
        double dx = x - Constants.ARENA_CENTER_X;
        double dy = y - Constants.ARENA_CENTER_Y;
        return dx * dx + dy * dy <= Constants.CENTER_RADIUS * Constants.CENTER_RADIUS;
    }

    /** Fairness rule (doc section 5.2): release all occupations before a shrink transition. */
    public void releaseAllOccupations() {
        for (NodePoint n : nodes) {
            n.occupiedBy = null;
        }
    }
}
