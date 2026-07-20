# Node Runner
## 📸 Screenshots

### Home View
![Screenshot 1](Asset/ss/1.png)

### Polygon View
![Screenshot 2](Asset/ss/2.png)

### Pitch View
![Screenshot 3](Asset/ss/3.png)

### Circle View
![Screenshot 4](Asset/ss/4.png)

### Eminination
![Screenshot 5](Asset/ss/5.png)

### Result 
![Screenshot 6](Asset/ss/6.png)

Node Runner is a server-authoritative 2D survival game built with Node.js, Express, Socket.IO, and HTML5 Canvas. The browser handles rendering and input, while the server owns room state, bot behavior, arena rules, collisions, timer and health updates, and win conditions.

## What it includes

- Play instantly against bots with 3 to 8 total runners
- Host human-only rooms or mixed rooms with human players plus exact bot fill
- Join rooms with a five-character room code
- Choose between Polygon, Football Pitch, and Circular arenas
- Track health, timer, zone state, and end-of-match results in the UI
- Save browser-local settings, match records, high scores, and achievements
- Run on a single Node.js server with full multiplayer synchronization

## Gameplay summary

- Each arena always has one fewer active node than alive players
- Only one runner can occupy a node at a time
- Capturing a different node restores health to full
- Re-entering the same node immediately does not restore health
- Leaving a node creates a personal three-second cooldown for that player
- The timer pauses while you own a node and increases everywhere else
- Staying in a node drains health, while the center zone recovers health slowly
- Field movement drains health slowly and gets harsher near the timer limit
- Eliminations happen when health reaches zero or the timer reaches its maximum
- After each elimination, the arena shrinks and one node disappears
- The last surviving player wins

Bots use a small state machine with SEEK_NODE, HOLD_NODE, ROTATE, RECOVER_CENTER, and INTERCEPT states.

## Balance values

All core tuning values live in [server/constants.js](server/constants.js).

| Mechanic | Value |
|---|---:|
| Maximum health | 100 |
| Initial round timer | 30 seconds |
| Timer after each shrink | Previous limit minus 5 seconds, minimum 5 |
| Player speed | 228 px/s |
| Node health drain | 8.5 health/s |
| Field health drain | 0.75 health/s |
| Center recovery | 5.5 health/s |
| Timer outside a node | +1 second/s |
| Critical timer pressure begins | 80% |
| Initial countdown | 3 seconds |
| Arena transition | 1.8 seconds |

## Run locally

### Requirements

- Node.js 24.x
- npm

### Install

```powershell
npm install
```

### Start the server

```powershell
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

Do not use Live Server. Rooms, bots, host/join, and real-time gameplay all depend on the Node.js and Socket.IO server.

### Development and checks

```powershell
npm run dev
```

```powershell
npm run check
```

```powershell
npm test
```

## Test multiplayer locally

1. Start the server with `npm start`.
2. Open [http://localhost:3000](http://localhost:3000) in two browser windows.
3. Host a room in the first window.
4. Copy the room code.
5. Join the same code in the second window.
6. Fill the lobby with the desired human slots or let the host add bots when the match starts.

## Play over Wi-Fi

The server listens on all network interfaces.

1. On the host machine, run `ipconfig`.
2. Find the IPv4 address, such as `192.168.0.15`.
3. Other devices on the same network can open `http://192.168.0.15:3000`.

Windows Firewall may ask for permission. Allow Node.js on the private network.

## Deploy on Render

The repository includes a root-level Render Blueprint in [render.yaml](render.yaml). It deploys the Express app as a single web service and serves the `public/` folder and Socket.IO traffic from the same origin.

### Blueprint deployment

1. Push the repository to GitHub.
2. In Render, choose New → Blueprint.
3. Connect the repository and select [render.yaml](render.yaml).
4. Deploy the created web service.

### Expected Render settings

- Runtime: Node
- Region: Singapore
- Plan: Free
- Instances: 1
- Build command: npm ci
- Start command: npm start
- Health check path: /health
- Auto deploy: every commit to main

All rooms, players, matches, and bots live in memory. That keeps deployment simple, but active matches are lost if the service restarts, redeploys, or scales beyond one instance.

## Project layout

```text
Node_runner/
├── package.json
├── server.js
├── server/
│   ├── arena.js
│   ├── constants.js
│   └── GameRoom.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── AudioManager.js
│       ├── GameClient.js
│       ├── InputController.js
│       ├── main.js
│       ├── PlayerPreferences.js
│       ├── Renderer.js
│       └── UI.js
├── tests/
│   ├── game.test.js
│   └── preferences.test.js
├── Asset/
│   └── music/
├── charcters/
├── LLM_HANDOFF.md
├── README.md
└── render.yaml
```

## Key files

- [server.js](server.js) creates the HTTP server, serves static files, exposes `/health`, and wires Socket.IO room events.
- [server/GameRoom.js](server/GameRoom.js) contains the authoritative match simulation, lobby logic, bots, movement, collisions, and scoring.
- [server/arena.js](server/arena.js) builds the arena geometry and clamps movement to the play area.
- [public/js/GameClient.js](public/js/GameClient.js) manages Socket.IO connection, room requests, input transmission, snapshots, and reconciliation.
- [public/js/Renderer.js](public/js/Renderer.js) draws the arena, players, overlays, and match state on Canvas.
- [public/js/PlayerPreferences.js](public/js/PlayerPreferences.js) stores browser-local settings and match progression.

## Known limits

- All clients must connect to the same running server.
- Disconnected players are removed from the current match.
- There is no account system, public matchmaking, or reconnect-to-match support.
- Browser progress is stored locally only.
- The current in-memory room model is intended for a single running service instance.
