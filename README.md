# Node Survival — JavaFX Prototype (v0.1)

Minimal playable core loop for the Game Jam, per `Node_Survival_Game_Design_and_Technical_Handoff.pdf`.
This is deliberately small: it proves the loop end-to-end so upgrades can be added on top without
reworking the foundation.

## Run it

Requires JDK 17+ and Maven.

```
mvn clean javafx:run
```

## Controls

- **Menu:** press `3`–`7` to pick player count (you + bots), `SPACE` to start.
- **In match:** `WASD` or arrow keys to move.
- **Game over:** `R` to restart with the same player count.

## What's implemented (maps to doc sections)

| Feature | Doc section | Status |
|---|---|---|
| Alive players = active nodes + 1 | 2, 3.1 | ✅ |
| Node claim restores heart to max | 3.2 | ✅ |
| Node heart drain (anti-camping) | 3.2, 4 | ✅ |
| Timer pauses in node, increases elsewhere | 4.1 | ✅ |
| Center zone slow recovery, timer still runs | 3.4 | ✅ |
| Stress-multiplier elimination model | 4.2 (Option A, recommended) | ✅ |
| Same-node re-entry lockout | 3.5 | ✅ (4s lockout) |
| Elimination + arena shrink | 5.1 | ✅ |
| Geometry vs. active-node-count table | 5.2 | ✅ (polygon only) |
| Fairness rule: release occupations before shrink | 5.2 | ✅ |
| Bot FSM (SEEK_NODE / RECOVER_CENTER / INTERCEPT / ROTATE) | 7.1 | ✅ |
| HUD: heart bar, exposure timer, zone, alive count | 7.3 | ✅ (basic) |

## What's intentionally NOT here yet (per the doc's own cut list, section 10.2)

1. Online multiplayer (host/join) — stretch goal in the doc, section 9.
2. Football-pitch and circular arena types — polygon only for now (section 6).
3. Combat, dash, pushing, power-ups.
4. Character selection / cosmetics.
5. Persistent scores/accounts.
6. Advanced bot prediction (current INTERCEPT is a simple heuristic, not real prediction).
7. `EVADE` bot state (needs a collision/pressure system first, per the doc).

## Open design decisions still unresolved (doc section 11.2)

The exact elimination formula, whether field movement should drain heart at all, and
combat/push mechanics are still open per the handoff doc. This build uses the doc's own
**recommended first-prototype interpretation**: stress multiplier, heart-only elimination,
cumulative exposure timer. Treat these as placeholders for the team's next balance pass,
not final decisions — see `Constants.java` for every tunable number in one place.

## Project structure

```
src/main/java/nodesurvival/
  GameApp.java            - JavaFX entry point, input, render loop
  model/                  - Player, NodePoint, Zone, GameState
  systems/
    ArenaManager.java     - polygon layout + shrink geometry
    BotSystem.java        - bot FSM + steering
    GameManager.java      - per-frame tick: zones, heart/timer, claim, eliminate
  ui/Renderer.java        - canvas drawing + HUD
  util/Constants.java     - all balance/tuning values in one place
```

## Next steps (suggested order, per doc section 10)

1. Playtest and tune `Constants.java` (node drain, field drain, center recovery, stress divisor).
2. Add sound/visual feedback polish (doc 7.3: pulse on low heart, shrink warning, elimination sound).
3. Add a second arena type once the core loop feels good.
4. Only after the above is solid: attempt Socket.IO-equivalent networking (a Java WebSocket/RMI
   layer would replace section 9's Node.js/Socket.IO recommendation, since this build is JavaFX
   rather than the doc's originally-recommended Phaser/JS stack).
