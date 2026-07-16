# Node Runner — Full JavaScript Multiplayer Prototype

A server-authoritative 2D survival game built with **JavaScript**, **HTML5 Canvas**, **Node.js**, **Express**, and **Socket.IO**.

The HTML file is only the browser launcher and page structure. All gameplay, bot AI, arena logic, synchronization, rendering, health/timer rules, host rooms, and join rooms are implemented in JavaScript.

## Implemented features

### Main menu

- Play instantly with bots
- Host a multiplayer room
- Join using a five-character host code
- Select 4–8 total runners
- Select Polygon, Football Pitch, or Circular arena
- In-game help panel

### Gameplay

- Total active nodes = alive players − 1
- One player can occupy a node at a time
- Occupied nodes physically reject other players
- Capturing a different node restores health to 100
- Re-entering the same node consecutively does not restore health
- Timer pauses only while the player owns a node
- Timer increases everywhere outside nodes, including the center zone
- Staying inside a node drains health quickly to prevent camping
- Center zone restores health slowly while the timer continues
- Field movement drains health slowly
- High timer exposure increases field pressure near the timer limit
- Elimination occurs when health reaches 0 or timer reaches its maximum
- After an elimination, the arena shrinks and one node disappears
- The geometry never becomes smaller than a triangle
- The last surviving player wins

### Player information

Every runner has visible stats:

- Health bar and numeric health beside the player
- Timer bar and numeric timer beside the player
- Zone state: NODE, CENTER, or FIELD
- Complete status cards in the right sidebar
- Event feed for node captures, eliminations, shrinking, and victory

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
| Maximum timer | 150 seconds |
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

- Node.js 18 or newer
- npm

### Installation

Open the project folder in VS Code and run:

```powershell
npm install
npm start
```

Open:

```text
http://localhost:3000
```

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
6. The host can keep **Fill empty slots with bots** enabled and start immediately.

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

## Internet multiplayer

For players outside the host's local network, deploy the whole Node.js project to a hosting platform that supports long-running Node processes and WebSocket connections. After deployment, every player opens the same deployed URL and uses the host/join code normally.

This prototype does not include accounts, matchmaking, persistent storage, anti-cheat, or reconnect-to-running-match support.

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
- No sound assets, character sprites, accounts, saved progression, or public matchmaking are included.
- Internet play requires deployment to a WebSocket-capable Node.js host.
