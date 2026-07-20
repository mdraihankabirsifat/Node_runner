# Node Runner — Full JavaScript Multiplayer Prototype

A server-authoritative 2D survival game built with **JavaScript**, **HTML5 Canvas**, **Node.js**, **Express**, and **Socket.IO**.

The HTML file is only the browser launcher and page structure. All gameplay, bot AI, arena logic, synchronization, rendering, health/timer rules, host rooms, and join rooms are implemented in JavaScript.

## Implemented features

### Main menu

- Play instantly with bots using 3–8 total runners
- Host a 3–8 player human-only room
- Host a mixed room with at least 2 humans and an exact bot count
- Join using a five-character host code
- Mixed compositions must total 3–8 runners; bot count may be 0
- Select Polygon, Football Pitch, or Circular arena
- In-game help panel
- Homepage settings for independent music and game-sound controls
- Browser-local career records, high score, and six unlockable achievements

### Gameplay

- Total active nodes = alive players − 1
- One player can occupy a node at a time
- Occupied nodes physically reject other players
- Capturing a different node restores health to 100
- Re-entering the same node consecutively does not restore health
- Leaving a node prevents only that player from re-entering it for 3 seconds
- Timer pauses only while the player owns a node
- Timer increases everywhere outside nodes, including the center zone
- Staying inside a node drains health quickly to prevent camping
- Center zone restores health slowly while the timer continues
- Field movement drains health slowly
- High timer exposure increases field pressure near the timer limit
- Elimination occurs when health reaches 0 or timer reaches its maximum
- After an elimination, the arena shrinks and one node disappears
- Polygon mode uses a square with diagonal nodes at three runners, then a triangle with one node at two runners
- The last surviving player wins

### Player information

Every runner has visible stats:

- Health bar and numeric health beside the player
- Timer bar and numeric timer beside the player
- Zone state: NODE, CENTER, or FIELD
- Complete status cards in the right sidebar
- Event feed for node captures, eliminations, shrinking, and victory
- Final all-player results for distance covered, active playing time, and survival efficiency

### Bots

Bots use a small state machine:

- `SEEK_NODE`
- `HOLD_NODE`
- `ROTATE`
- `RECOVER_CENTER`
- `INTERCEPT`

They evaluate health, timer, node availability, previous-node restrictions, crowding, and distance.

### Multiplayer and synchronization

- Server-authoritative player movement and game state
- 30 Hz server simulation
- 20 Hz state snapshots
- 30 Hz input transmission
- Local client-side movement prediction
- Soft server reconciliation for the local player
- Interpolation for remote players
- Server-authoritative node ownership
- Server-authoritative health, timer, elimination, arena shrinking, and winner selection
- Host transfer when the host leaves and another human remains

## Current balance values

All values can be changed in `server/constants.js`.

| Mechanic | Value |
|---|---:|
| Maximum health | 100 |
| Initial round timer | 30 seconds |
| Timer after each shrink | Previous limit minus 5 seconds (minimum 5) |
| Player speed | 228 px/s |
| Node health drain | 8.5 health/s |
| Field health drain | 0.75 health/s |
| Center recovery | 5.5 health/s |
| Timer outside node | +1 second/s |
| Critical timer pressure begins | 80% |
| Initial countdown | 3 seconds |
| Arena transition | 1.8 seconds |

## Run the game

### Requirements

- Node.js 24 LTS
- npm

### Installation

Clone or open the repository root, then install production dependencies:

```powershell
npm install
```

Start the Express and Socket.IO server:

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

> Do not use the VS Code Live Server extension. It serves only the browser files and bypasses the Node.js/Socket.IO server required for rooms, bots, host/join, and realtime gameplay.

For automatic server restart during development:

```powershell
npm run dev
```

For JavaScript syntax checks:

```powershell
npm run check
```

## Test Host and Join on one computer

1. Start the server with `npm start`.
2. Open `http://localhost:3000` in two browser windows.
3. In the first window, click **Host game**.
4. Copy the generated room code.
5. In the second window, click **Join game** and enter the code.
6. In Human mode, connect all configured human runners. In Mix mode, connect the configured human slots; the exact bot count is added when the host starts.

## Play on the same Wi-Fi network

The server listens on all network interfaces.

On the host computer, run:

```powershell
ipconfig
```

Find the host computer's IPv4 address, for example `192.168.0.15`. Teammates connected to the same Wi-Fi can open:

```text
http://192.168.0.15:3000
```

Windows Firewall may ask for permission. Allow Node.js on the private network.

A room code works only when all players are connected to the **same running Node Runner server**.

## Deploy publicly on Render

This repository is configured to deploy as one Render Web Service using the root-level `render.yaml`. Express serves the complete `public/` folder and Socket.IO shares the same HTTP server and public origin.

### GitHub and Blueprint deployment

1. Commit and push the repository to GitHub.
2. In Render, choose **New → Blueprint**.
3. Connect the GitHub repository.
4. Select the repository's `render.yaml`.
5. Confirm the `node-runner` Web Service and deploy it.
6. Render automatically deploys every commit pushed to the connected `main` branch.

The Blueprint configures:

- Runtime: Node
- Region: Singapore
- Plan: Free
- Instances: 1
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- Auto deploy: Every commit to `main`

For manual Web Service creation instead of a Blueprint, use the same values and leave the root directory blank because `package.json` is in the repository root.

### Playable URL

```text
https://YOUR-RENDER-SERVICE-NAME.onrender.com
```

Replace the placeholder after Render assigns the final service URL. Every player must open the same deployed URL for room codes and multiplayer synchronization to work.

### In-memory Game Jam state

Rooms, players, matches, and bots intentionally remain in server memory. No database is required. This keeps the Game Jam deployment simple, but active rooms are lost whenever Render restarts, redeploys, spins down, or replaces the service instance. Keep the service at one instance unless a shared Socket.IO adapter and shared room store are added later.

This prototype does not include accounts, persistent matchmaking, saved rooms, anti-cheat, or reconnect-to-running-match support.

## Project structure

```text
Node_runner_full_js/
├── package.json
├── server.js
├── server/
│   ├── constants.js
│   ├── arena.js
│   └── GameRoom.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── main.js
│       ├── GameClient.js
│       ├── InputController.js
│       ├── Renderer.js
│       └── UI.js
├── LLM_HANDOFF.md
└── README.md
```

## Important files

### `server/GameRoom.js`

Contains the authoritative match simulation:

- Room and lobby management
- Player and bot creation
- Movement
- Player collisions
- Exclusive node ownership
- Health and timer updates
- Bot decisions
- Eliminations
- Arena shrinking
- Snapshots and game events

### `server/arena.js`

Contains:

- Polygon generation
- Football pitch perimeter nodes
- Circular arena nodes
- Center-zone shapes
- Arena boundary clamping

### `server/constants.js`

Contains every important balance value.

### `public/js/Renderer.js`

Draws the game through HTML5 Canvas:

- All arena types
- Nodes and occupancy states
- Players
- Health/timer panels beside every player
- Center recovery zone
- Local-player highlighting

### `public/js/GameClient.js`

Handles:

- Socket.IO connection
- Host/join requests
- Input transmission
- Snapshot reception
- Local prediction
- Remote interpolation
- Screen transitions

## Replace the current repository safely

From the existing `Node_runner` repository:

```powershell
git checkout -b feature/full-javascript-multiplayer
```

Remove the old Java/Maven files, then copy this project into the repository root.

```powershell
git add -A
git commit -m "Rebuild Node Runner with JavaScript multiplayer"
git push -u origin feature/full-javascript-multiplayer
```

Create a pull request into `main` after the team tests the game.

## Recommended playtesting order

1. Test Play with Bots using four runners.
2. Verify that only one runner can own each node.
3. Verify that a different node restores health.
4. Verify that the same node does not restore health consecutively.
5. Verify that the timer pauses in a node and increases elsewhere.
6. Test Host/Join with two browser windows and bot filling.
7. Test over local Wi-Fi on two devices.
8. Tune balance values in `server/constants.js`.

## Known limitations

- Host and join require all clients to use one shared running server.
- A disconnected player is removed from the current match; automatic reconnection into the same runner is not implemented.
- The client uses keyboard controls and is optimized for desktop browsers.
- Music and game sounds are synthesized with the Web Audio API, so no external audio assets are required.
- Career records and achievements are saved only in the current browser; there are no accounts or cross-device progression sync.
- Public matchmaking is not included.
- Internet play requires deployment to a WebSocket-capable Node.js host.
- Render restarts, deploys, and free-tier spin-downs clear all in-memory rooms.
- The current in-memory Socket.IO room model must run as a single service instance.
