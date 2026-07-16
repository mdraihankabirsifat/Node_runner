# Node Runner Changelog

## 1.2.0 — Results, timer rounds, and bot movement

### Gameplay

- Minimum total match size is now 3 runners.
- The initial exposure limit is now 30 seconds.
- Each arena shrink resets survivor timers to 0.
- Each new round has 5 seconds less exposure time than the previous round, with a 5-second minimum.
- Entering an owned node pauses the timer.
- Capturing a different node restores health to 100.
- Bots use separation and opposite sidestepping to reduce head-on clogging.

### Match results

- The game-over screen shows every runner in one frame.
- The results use a full-viewport overlay so they are not clipped by the canvas.
- Results include distance covered, active playing time, and survival efficiency.
- Survival efficiency is the percentage of total active match time that the runner survived.

### Reduced arenas

- Three remaining runners use a square with two nodes on opposite corners.
- Two remaining runners use a triangle with one node.

## 1.1.0 — Four-change update

### Gameplay

- Every player now starts each match with `timer = 45` seconds.
- Leaving a claimed node starts a personal 3-second cooldown for that node.
- A player cannot reclaim that same node until the cooldown expires.
- Reclaiming the same last node after cooldown still does not restore health.
- Bot targeting ignores nodes that are unavailable because of the bot's own cooldown.

### Lobby and match composition

- Minimum match size is 3 runners.
- Hosts choose an exact bot count.
- The remaining slots are reserved for human players.
- The match cannot start until all required human slots are filled.
- Play with Bots automatically uses one human and fills all remaining slots with bots.

### Interface

- Compact player statistics moved to the left side.
- The game canvas is displayed on the right side on desktop screens.
- The local player's cooling node displays a WAIT label, countdown, and cooldown ring.

### Verification

- JavaScript syntax checks pass.
- Eleven automated gameplay tests pass.
- Express startup and `/health` endpoint were verified.
