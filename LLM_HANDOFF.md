# Node Runner — Canonical LLM Handoff

Use this document when continuing development with another LLM. Treat the rules under **Confirmed design** as authoritative unless the team explicitly changes them.

## Project objective

Build a fast top-down 2D competitive survival game in JavaScript. The game combines musical-chair competition, movement, health management, exposure-time management, exclusive corner nodes, and a shrinking arena.

## Confirmed design

### Player and node counts

- If there are `P` alive players, there are `P - 1` active nodes.
- Therefore, at least one runner cannot occupy a node.
- Initial player count is configurable from 4 to 8.
- The polygon geometry never becomes smaller than a triangle.
- With two runners remaining, the geometry is still triangular but only one active node exists.

### Player parameters

Every runner has exactly two main survival parameters:

1. `health`
2. `timer`

Current implementation:

- Health range: 0–100.
- Timer counts upward from 0.
- Timer pauses only while the runner owns a node.
- Timer increases in the normal field and in the center recovery zone.
- A runner is eliminated if health reaches 0 or timer reaches the configured maximum.

### Node rules

- A node can have only one occupant.
- Node ownership is decided by the server.
- Other runners are physically blocked from entering an occupied node.
- Reaching a node different from the player's previous activated node restores health to maximum.
- Returning to the same node consecutively does not restore health.
- Staying in a node drains health quickly, forcing rotation.
- Timer is paused while inside an owned node.

### Center rules

- Polygon and football arenas use a circular center recovery zone.
- Circular arena uses a rectangular center recovery zone.
- Health recovers slowly in the center.
- Timer continues increasing in the center.
- Therefore, the center is a temporary recovery option, not permanent safety.

### Field rules

- Timer increases.
- Health drains slowly.
- Near the timer limit, field pressure causes additional health damage.

### Elimination and shrinking

- Health reaches 0 or timer reaches maximum → eliminated.
- After one or more eliminations, all node ownership is released.
- The arena shrinks.
- Active nodes become `alivePlayers - 1`.
- Alive players are repositioned near the center.
- A new countdown begins.
- The last alive runner wins.

### Arena types

1. Polygon arena
   - Outer boundary is a regular polygon.
   - Nodes are on corners or evenly distributed when fewer nodes than geometric corners remain.
   - Center recovery zone is circular.

2. Football-pitch arena
   - Outer boundary is a rectangle.
   - Nodes are distributed evenly around its perimeter.
   - Center recovery zone is circular.

3. Circular arena
   - Outer boundary is circular.
   - Nodes are distributed on the circumference.
   - Center recovery zone is rectangular.

### Play modes

1. Play with bots
2. Host a game
3. Join a game with a five-character room code

The host chooses:

- Total runners
- Arena type
- Whether empty slots are filled with bots

## Current technology

- JavaScript ES modules
- Node.js
- Express static server
- Socket.IO realtime networking
- HTML5 Canvas rendering
- CSS page/lobby interface

HTML is only the browser launcher and UI structure. All gameplay systems are JavaScript.

## Networking model

The server is authoritative for:

- Positions
- Movement boundaries
- Player collisions
- Node ownership
- Health
- Timer
- Elimination
- Arena shrinking
- Winner selection

Synchronization:

- Server simulation: 30 Hz
- Snapshot broadcast: 20 Hz
- Client input send rate: 30 Hz
- Local player: client-side prediction plus soft reconciliation
- Remote players: target-position interpolation

Socket events:

### Client → server

- `room:create`
- `room:join`
- `room:updateSettings`
- `room:start`
- `room:leave`
- `game:input`

### Server → client

- `room:update`
- `game:snapshot`
- `game:event`

## Server state machine

- `lobby`
- `countdown`
- `playing`
- `transition`
- `gameover`

## Important implementation files

- `server/GameRoom.js`: authoritative match logic and bots.
- `server/arena.js`: arena generation and boundary clamping.
- `server/constants.js`: all tuning values.
- `public/js/GameClient.js`: networking and client loop.
- `public/js/Renderer.js`: Canvas game rendering and per-player stats.
- `public/js/UI.js`: menu, lobby, status cards, and overlays.

## Current balance assumptions

- Maximum timer: 150 seconds.
- Timer does not reset when a node is captured; it only pauses.
- A new node resets health, not timer.
- Health drains inside nodes to prevent camping.
- Timer can directly eliminate a runner at its maximum.

These are tuning decisions, not immutable lore. The team may change them after playtesting.

## Highest-priority future work

1. Playtest and tune timer/health balance.
2. Add sound feedback and basic sprite animations.
3. Add mobile/touch controls only if needed.
4. Add reconnect tokens if internet multiplayer becomes important.
5. Add deployment configuration.
6. Add game options such as timer maximum and node drain without exposing unsafe arbitrary values.
7. Add automated unit tests for node claims, timer pausing, and elimination.

## Rules another LLM must not accidentally break

- Never allow two node occupants.
- Never trust the client for health, timer, node ownership, or elimination.
- Do not make the center pause the timer.
- Do not create as many nodes as players.
- Do not allow repeated same-node healing.
- Do not remove the final triangular geometry when two players remain.
- Do not update remote positions by snapping directly to every network snapshot; interpolation must remain.
