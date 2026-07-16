package nodesurvival.util;

/**
 * Central tuning values. Kept in one place so balance passes (per the
 * design doc's Day 3 "balance pass" step) only touch this file.
 */
public final class Constants {
    private Constants() { }

    // --- Heart / timer balance (see handoff doc section 4.2) ---
    public static final double MAX_HEART = 100.0;
    public static final double NODE_DRAIN_PER_SEC = 10.0;       // camping ~8-12s before death
    public static final double FIELD_DRAIN_PER_SEC = 1.5;       // before stress multiplier
    public static final double CENTER_RECOVERY_PER_SEC = 4.0;   // before stress reduction
    public static final double EXPOSURE_STRESS_DIVISOR = 90.0;  // stress = 1 + min(exposure/90, cap)
    public static final double STRESS_CAP = 1.25;

    // --- Anti-exploit (section 3.5 recommendation) ---
    public static final double SAME_NODE_LOCKOUT_SECONDS = 4.0;

    // --- Geometry ---
    public static final double NODE_RADIUS = 34.0;
    public static final double CENTER_RADIUS = 70.0;
    public static final double PLAYER_RADIUS = 14.0;
    public static final double ARENA_LAYOUT_RADIUS = 300.0;
    public static final double ARENA_CENTER_X = 450.0;
    public static final double ARENA_CENTER_Y = 450.0;

    // --- Movement / pacing ---
    public static final double PLAYER_SPEED = 180.0; // px/sec
    public static final double COUNTDOWN_SECONDS = 3.0;
    public static final double TRANSITION_SECONDS = 1.6;
}
