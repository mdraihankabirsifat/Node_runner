package nodesurvival.model;

/**
 * Simplified version of the doc's section 8.4 state machine.
 * LOBBY is skipped for this minimal single-machine prototype.
 */
public enum GameState {
    MENU,
    COUNTDOWN,
    ROUND_ACTIVE,
    ARENA_TRANSITION,
    GAME_OVER
}
