# Node Runner itch.io page copy

Replace every bracketed placeholder before publishing.

## Title

Node Runner

## One-line tagline

Claim the nodes, manage your exposure, and outlast every runner in a shrinking online arena.

## Short description

Node Runner is a fast server-authoritative 2D survival game. Race other players or bots for exclusive nodes, rotate before your health burns out, and survive as the arena shrinks after every elimination.

## Features

- Instant matches with bots
- Human-only and mixed human/bot online rooms
- Five-character room codes for host and join
- Polygon, football pitch, and circular arenas
- Exclusive node capture, health management, and exposure timer pressure
- Server-authoritative movement, collisions, eliminations, and winner selection
- Match statistics, browser-local high scores, achievements, music, and sound controls
- Windows portable edition and browser edition using the same multiplayer server

## How to play

There is always one fewer active node than living runners. Move to an available node to claim it. Capturing a different node restores health, but remaining inside drains health over time. Outside a claimed node, your exposure timer increases. The center restores health slowly but does not stop the timer. After each elimination, the arena shrinks and one node disappears. The last runner alive wins.

## Controls

- Move: WASD or Arrow keys
- Pause/resume the local game view: Q
- Toggle desktop fullscreen: F11 or Alt+Enter
- Leave desktop fullscreen: Escape
- Reload/retry: Ctrl+R

## Multiplayer instructions

Choose **Human** to host a human-only room or **Mix** to configure human and bot slots. Share the five-character room code with players using either the browser or Windows version. Everyone must connect to the same shared Node Runner server. Bot mode starts an immediate match.

## Online requirement

**The Windows version requires an internet connection because multiplayer, rooms, bots and authoritative match simulation are hosted on the shared Node Runner server.**

Render may need a short time to wake after inactivity. If the Windows connection screen appears, wait briefly and select Retry.

## Framework used

JavaScript, HTML5 Canvas, Node.js, Express, Socket.IO and Electron.

## GitHub repository

https://github.com/mdraihankabirsifat/Node_runner

## Browser version

https://node-runner-xayv.onrender.com

## Team members

- Team: [TEAM NAME]
- [TEAM MEMBER 1 - ROLE]
- [TEAM MEMBER 2 - ROLE]
- [ADD EVERY OTHER TEAM MEMBER]

## Asset credits

[LIST EACH ASSET, AUTHOR, SOURCE, AND LICENCE AFTER MANUAL VERIFICATION. DO NOT PUBLISH UNVERIFIED OR INVENTED CREDITS.]

## Known limitations

- The Windows and browser editions require the shared online server.
- Active rooms are stored in server memory and are cleared when Render restarts, redeploys, or spins down.
- A disconnected player cannot automatically reclaim the same runner in an active match.
- Saved settings and achievements are local to each browser or Electron profile and do not sync between devices.
- The jam executable is unsigned and may trigger a Windows SmartScreen warning.
