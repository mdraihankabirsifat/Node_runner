# Node Runner — JavaScript Game Jam Build

A dependency-free HTML5 Canvas implementation of the Node Runner core loop. It replaces the earlier JavaFX prototype so the team can iterate quickly with JavaScript during the five-day Game Jam.

## Run locally

Because the project uses JavaScript modules, serve the folder through a local server rather than opening `index.html` directly.

### VS Code

Install **Live Server**, then right-click `index.html` → **Open with Live Server**.

### Python

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Controls

- Move: `WASD` or arrow keys
- Pause/resume: `P` or `Esc`
- Menu start shortcut: `Space`

## Implemented core rules

- `players = active nodes + 1`
- One player per node
- New/different node restores heart to maximum
- Same node cannot restore the same player twice consecutively
- Heart drains rapidly while staying on a node, preventing camping
- Exposure timer pauses in a node and increases everywhere else
- Exposure increases the danger of normal field movement
- Center heals slowly, but exposure keeps increasing and eventually overcomes recovery
- Player elimination at zero heart
- After elimination, arena shrinks and active node count becomes `alive players - 1`
- Arena geometry never goes below a triangle
- Polygon, football-pitch, and circular arena variants
- Bot states: seek node, rotate, recover center, intercept, hold node
- Main menu, match HUD, pause, event feed, game-over summary

## Important design interpretation

The increasing timer is implemented as **cumulative exposure**, not a countdown and not a direct instant-elimination threshold. It pauses inside nodes. Outside nodes it rises and increases the field heart-drain multiplier. This makes both heart and timer matter while avoiding the problem where every player automatically dies within one minute.

## Project structure

```text
index.html
css/styles.css
js/config.js
js/utils.js
js/entities/
  NodePoint.js
  Player.js
js/systems/
  Arena.js
  BotAI.js
  Game.js
js/main.js
```

## Balance tuning

All important values are in `js/config.js`, including movement speed, heart drain, center recovery, stress scaling, bot decisions, arena size, and transition time.

## Not implemented yet

Online host/join networking is intentionally not faked in the client. The menu presents those modes as Phase 2. A proper implementation needs a server-authoritative Node.js + Socket.IO service for movement validation, node claims, vitals, elimination, and room-code state.
