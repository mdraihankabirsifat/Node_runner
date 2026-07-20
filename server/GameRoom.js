import { BALANCE, BOT_NAMES, PLAYER_COLORS, WORLD } from './constants.js';
import {
  buildArena,
  clampPlayerToArena,
  isPointInsideCenterZone,
} from './arena.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeName(value, fallback = 'Runner') {
  const name = String(value ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 16);
  return name || fallback;
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeInput(input) {
  const horizontal = Number(Boolean(input?.right)) - Number(Boolean(input?.left));
  const vertical = Number(Boolean(input?.down)) - Number(Boolean(input?.up));
  const magnitude = Math.hypot(horizontal, vertical);
  if (magnitude === 0) return { x: 0, y: 0 };
  return { x: horizontal / magnitude, y: vertical / magnitude };
}

function normalizeGameMode(value, fallback = 'human') {
  return ['bot', 'human', 'mix'].includes(value) ? value : fallback;
}

function normalizeComposition(settings, humanCount, current = {}) {
  const fallbackMode = current.gameMode
    ?? (settings.fillBots === false ? 'human' : 'bot');
  const gameMode = normalizeGameMode(settings.gameMode, fallbackMode);

  if (gameMode === 'bot') {
    const maxPlayers = clamp(
      Number(settings.maxPlayers) || current.maxPlayers || BALANCE.minPlayers,
      BALANCE.minPlayers,
      BALANCE.maxPlayers,
    );
    return {
      gameMode,
      humanSlots: 1,
      botCount: maxPlayers - 1,
      maxPlayers,
    };
  }

  if (gameMode === 'human') {
    const requestedHumans = Number(settings.humanPlayers ?? settings.maxPlayers)
      || current.humanSlots
      || BALANCE.minPlayers;
    const humanSlots = clamp(
      Math.max(requestedHumans, humanCount, BALANCE.minPlayers),
      BALANCE.minPlayers,
      BALANCE.maxPlayers,
    );
    return {
      gameMode,
      humanSlots,
      botCount: 0,
      maxPlayers: humanSlots,
    };
  }

  const requestedHumans = Number(settings.humanPlayers)
    || current.humanSlots
    || BALANCE.minMixedHumans;
  const humanSlots = clamp(
    Math.max(requestedHumans, humanCount, BALANCE.minMixedHumans),
    BALANCE.minMixedHumans,
    BALANCE.maxPlayers,
  );
  const requestedBots = Number(settings.botCount);
  let botCount = Number.isFinite(requestedBots)
    ? requestedBots
    : (current.botCount ?? Math.max(0, BALANCE.minPlayers - humanSlots));
  botCount = clamp(botCount, 0, BALANCE.maxPlayers - humanSlots);
  if (humanSlots + botCount < BALANCE.minPlayers) {
    botCount = BALANCE.minPlayers - humanSlots;
  }

  return {
    gameMode,
    humanSlots,
    botCount,
    maxPlayers: humanSlots + botCount,
  };
}

export class GameRoom {
  constructor(io, code, settings, hostSocket) {
    this.io = io;
    this.code = code;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.hostId = hostSocket.id;
    const composition = normalizeComposition(settings, 1);
    this.gameMode = composition.gameMode;
    this.humanSlots = composition.humanSlots;
    this.botCount = composition.botCount;
    this.maxPlayers = composition.maxPlayers;
    this.arenaType = ['polygon', 'football', 'circle'].includes(settings.arenaType)
      ? settings.arenaType
      : 'polygon';
    this.status = 'lobby';
    this.players = new Map();
    this.arena = buildArena(this.arenaType, this.maxPlayers, this.maxPlayers);
    this.round = 0;
    this.stateEndsAt = null;
    this.winnerId = null;
    this.botCounter = 0;
    this.snapshotAccumulator = 0;
    this.eventCounter = 0;
    this.lastElimination = null;
    this.roundTimerLimit = BALANCE.maxTimer;
    this.matchActiveTime = 0;

    const hostCharacterId = settings.characterId
      ?? (this.gameMode === 'bot' ? 1 : null);
    this.addHuman(hostSocket, settings.name || 'Host', hostCharacterId);
  }

  touch() {
    this.lastActivityAt = Date.now();
  }

  createPlayer({ id, socketId = null, name, isBot, preferredCharacterId = null }) {
    const color = PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    const usedCharacters = new Set(
      [...this.players.values()].map((player) => player.characterId),
    );
    const firstAvailableCharacterId = Array.from(
      { length: BALANCE.maxPlayers },
      (_, index) => index + 1,
    ).find((candidate) => !usedCharacters.has(candidate)) ?? 1;
    const requestedCharacterId = Number(preferredCharacterId);
    const characterId = Number.isInteger(requestedCharacterId)
      && requestedCharacterId >= 1
      && requestedCharacterId <= BALANCE.maxPlayers
      && !usedCharacters.has(requestedCharacterId)
      ? requestedCharacterId
      : isBot
        ? firstAvailableCharacterId
        : null;
    return {
      id,
      socketId,
      name: sanitizeName(name, isBot ? 'Bot' : 'Runner'),
      isBot,
      color,
      characterId,
      x: WORLD.centerX,
      y: WORLD.centerY,
      vx: 0,
      vy: 0,
      radius: BALANCE.playerRadius,
      health: BALANCE.maxHealth,
      timer: 0,
      distanceCovered: 0,
      playingTime: 0,
      alive: true,
      occupiedNodeId: null,
      lastNodeId: null,
      nodeReentryLocks: new Map(),
      zone: 'field',
      input: { up: false, down: false, left: false, right: false },
      lastInputSeq: 0,
      botTarget: null,
      botMode: 'SEEK_NODE',
      botDecisionAt: 0,
      eliminationCause: null,
    };
  }

  addHuman(socket, name, preferredCharacterId = null) {
    if (this.status !== 'lobby') {
      return { ok: false, error: 'The match has already started.' };
    }
    const humanCount = [...this.players.values()].filter((player) => !player.isBot).length;
    if (humanCount >= this.humanSlots) {
      return { ok: false, error: 'The room is full.' };
    }
    if (this.players.has(socket.id)) {
      return { ok: true, playerId: socket.id };
    }

    const player = this.createPlayer({
      id: socket.id,
      socketId: socket.id,
      name,
      isBot: false,
      preferredCharacterId,
    });
    this.players.set(player.id, player);
    socket.join(this.code);
    socket.data.roomCode = this.code;
    this.touch();
    this.broadcastLobby();
    return { ok: true, playerId: player.id };
  }

  removeHuman(socketId, reason = 'left') {
    const player = this.players.get(socketId);
    if (!player || player.isBot) return;

    if (player.occupiedNodeId) {
      const node = this.arena.nodes.find((item) => item.id === player.occupiedNodeId);
      if (node && node.occupantId === player.id) node.occupantId = null;
    }

    if (this.status === 'lobby') {
      this.players.delete(socketId);
    } else {
      if (player.alive) {
        this.eliminatePlayer(player, reason === 'disconnect' ? 'Disconnected' : 'Left the match');
      }
      this.players.delete(socketId);
    }

    if (this.hostId === socketId) {
      const nextHost = [...this.players.values()].find((candidate) => !candidate.isBot && candidate.id !== socketId);
      this.hostId = nextHost?.id ?? null;
    }

    this.touch();
    if (this.status === 'lobby') this.broadcastLobby();
  }

  updateSettings(socketId, settings) {
    if (socketId !== this.hostId || this.status !== 'lobby') {
      return { ok: false, error: 'Only the host can change lobby settings.' };
    }

    const humanCount = [...this.players.values()].filter((player) => !player.isBot).length;
    const composition = normalizeComposition(settings, humanCount, this);
    this.gameMode = composition.gameMode;
    this.humanSlots = composition.humanSlots;
    this.botCount = composition.botCount;
    this.maxPlayers = composition.maxPlayers;
    this.arenaType = ['polygon', 'football', 'circle'].includes(settings.arenaType)
      ? settings.arenaType
      : this.arenaType;
    this.arena = buildArena(this.arenaType, this.maxPlayers, this.maxPlayers);
    this.touch();
    this.broadcastLobby();
    return { ok: true };
  }

  fillConfiguredBots() {
    for (const [id, player] of this.players) {
      if (player.isBot) this.players.delete(id);
    }

    for (let index = 0; index < this.botCount; index += 1) {
      const botIndex = this.botCounter % BOT_NAMES.length;
      const id = `bot-${this.code}-${this.botCounter}`;
      this.botCounter += 1;
      const player = this.createPlayer({
        id,
        name: BOT_NAMES[botIndex],
        isBot: true,
      });
      this.players.set(id, player);
    }
  }

  humanCount() {
    return [...this.players.values()].filter((player) => !player.isBot).length;
  }

  isMixedReadyToStart() {
    return (
      this.status === 'lobby'
      && this.gameMode === 'mix'
      && this.humanCount() >= this.humanSlots
      && [...this.players.values()]
        .filter((player) => !player.isBot)
        .every((player) => Number.isInteger(player.characterId))
    );
  }

  start(socketId, preferredCharacterId = null) {
    if (socketId !== this.hostId) {
      return { ok: false, error: 'Only the host can start the match.' };
    }
    if (this.status !== 'lobby' && this.status !== 'gameover') {
      return { ok: false, error: 'The match is already running.' };
    }

    if (this.status === 'lobby' && preferredCharacterId !== null) {
      const selection = this.setCharacter(socketId, preferredCharacterId);
      if (!selection.ok) return selection;
    }

    const humanCount = this.humanCount();
    if (humanCount < this.humanSlots) {
      return {
        ok: false,
        error: `Waiting for ${this.humanSlots - humanCount} more human player(s).`,
      };
    }
    const unselectedHumans = [...this.players.values()].filter(
      (player) => !player.isBot && !Number.isInteger(player.characterId),
    );
    if (unselectedHumans.length > 0) {
      return {
        ok: false,
        error: `Waiting for ${unselectedHumans.length} player(s) to choose a character.`,
      };
    }
    this.fillConfiguredBots();

    this.resetMatch();
    return { ok: true };
  }

  resetMatch() {
    this.round = 1;
    this.roundTimerLimit = BALANCE.maxTimer;
    this.matchActiveTime = 0;
    this.winnerId = null;
    this.lastElimination = null;
    for (const player of this.players.values()) {
      player.health = BALANCE.maxHealth;
      player.timer = 0;
      player.distanceCovered = 0;
      player.playingTime = 0;
      player.alive = true;
      player.occupiedNodeId = null;
      player.lastNodeId = null;
      player.nodeReentryLocks.clear();
      player.zone = 'field';
      player.vx = 0;
      player.vy = 0;
      player.eliminationCause = null;
      player.botTarget = null;
      player.botDecisionAt = 0;
    }

    this.arena = buildArena(this.arenaType, this.players.size, this.players.size);
    this.positionAlivePlayers();
    this.beginCountdown(BALANCE.countdownSeconds);
    this.emitGameEvent('MATCH_START', 'The node race is starting!');
    this.touch();
  }

  beginCountdown(seconds) {
    this.status = 'countdown';
    this.stateEndsAt = Date.now() + seconds * 1000;
    this.broadcastSnapshot(true);
  }

  positionAlivePlayers() {
    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    const spawnRadius = Math.min(48, 12 + alivePlayers.length * 4);
    alivePlayers.forEach((player, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, alivePlayers.length);
      player.x = WORLD.centerX + Math.cos(angle) * spawnRadius;
      player.y = WORLD.centerY + Math.sin(angle) * spawnRadius;
      player.vx = 0;
      player.vy = 0;
      player.zone = 'field';
      player.occupiedNodeId = null;
    });
  }

  setInput(playerId, payload) {
    const player = this.players.get(playerId);
    if (!player || player.isBot || !player.alive) return;
    player.input = {
      up: Boolean(payload.up),
      down: Boolean(payload.down),
      left: Boolean(payload.left),
      right: Boolean(payload.right),
    };
    player.lastInputSeq = Math.max(player.lastInputSeq, Number(payload.seq) || 0);
    this.touch();
  }

  setCharacter(playerId, value) {
    if (this.status !== 'lobby') {
      return { ok: false, error: 'Characters can only be changed in the lobby.' };
    }
    const player = this.players.get(playerId);
    if (!player || player.isBot) {
      return { ok: false, error: 'Player not found.' };
    }
    const characterId = Number(value);
    if (!Number.isInteger(characterId) || characterId < 1 || characterId > BALANCE.maxPlayers) {
      return { ok: false, error: 'Invalid character selection.' };
    }
    const isTaken = [...this.players.values()].some(
      (candidate) => candidate.id !== playerId && candidate.characterId === characterId,
    );
    if (isTaken) {
      return { ok: false, error: 'That character is already selected.' };
    }

    player.characterId = characterId;
    this.touch();
    this.broadcastLobby();
    return { ok: true, characterId };
  }

  isNodeLockedForPlayer(player, nodeId, now = Date.now()) {
    const lockedUntil = player.nodeReentryLocks.get(nodeId);
    if (!lockedUntil) return false;
    if (now < lockedUntil) return true;
    player.nodeReentryLocks.delete(nodeId);
    return false;
  }

  chooseBotTarget(bot, now) {
    const availableNodes = this.arena.nodes.filter(
      (node) => !node.occupantId && !this.isNodeLockedForPlayer(bot, node.id, now),
    );
    const anyFreeNodes = this.arena.nodes.filter(
      (node) => !node.occupantId && !this.isNodeLockedForPlayer(bot, node.id, now),
    );
    const center = this.arena.centerZone;
    const centerTarget = center.type === 'circle'
      ? { x: center.x, y: center.y }
      : { x: center.x + center.width / 2, y: center.y + center.height / 2 };

    if (bot.occupiedNodeId && bot.health > 39 && bot.timer < this.roundTimerLimit - 4) {
      bot.botMode = 'HOLD_NODE';
      bot.botTarget = null;
      bot.botDecisionAt = now + 220;
      return;
    }

    if (!bot.occupiedNodeId && bot.health < 43 && bot.timer < this.roundTimerLimit * 0.84) {
      bot.botMode = 'RECOVER_CENTER';
      bot.botTarget = centerTarget;
      bot.botDecisionAt = now + 360;
      return;
    }

    const candidates = availableNodes.length > 0 ? availableNodes : anyFreeNodes;
    if (candidates.length > 0) {
      let best = candidates[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const node of candidates) {
        const distance = distanceBetween(bot, node);
        const sameNodePenalty = node.id === bot.lastNodeId ? 320 : 0;
        const crowdPenalty = [...this.players.values()].reduce((sum, player) => {
          if (!player.alive || player.id === bot.id || player.occupiedNodeId) return sum;
          return sum + (distanceBetween(player, node) < 95 ? 85 : 0);
        }, 0);
        const score = distance + sameNodePenalty + crowdPenalty + Math.random() * 35;
        if (score < bestScore) {
          best = node;
          bestScore = score;
        }
      }
      bot.botMode = bot.occupiedNodeId ? 'ROTATE' : 'SEEK_NODE';
      bot.botTarget = { x: best.x, y: best.y, nodeId: best.id };
      bot.botDecisionAt = now + 320 + Math.random() * 230;
      return;
    }

    const pressuredNodes = this.arena.nodes
      .filter((node) => node.occupantId && node.occupantId !== bot.id)
      .map((node) => ({ node, occupant: this.players.get(node.occupantId) }))
      .filter((item) => item.occupant?.alive)
      .sort((a, b) => a.occupant.health - b.occupant.health);

    if (pressuredNodes.length > 0) {
      const target = pressuredNodes[0].node;
      bot.botMode = 'INTERCEPT';
      bot.botTarget = { x: target.x, y: target.y, nodeId: target.id };
    } else {
      bot.botMode = 'RECOVER_CENTER';
      bot.botTarget = centerTarget;
    }
    bot.botDecisionAt = now + 300 + Math.random() * 200;
  }

  updateBots(now) {
    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.alive) continue;
      if (now >= bot.botDecisionAt) this.chooseBotTarget(bot, now);

      if (!bot.botTarget) {
        bot.input = { up: false, down: false, left: false, right: false };
        continue;
      }

      const dx = bot.botTarget.x - bot.x;
      const dy = bot.botTarget.y - bot.y;
      const distance = Math.hypot(dx, dy);

      if (bot.botMode === 'RECOVER_CENTER' && bot.zone === 'center' && bot.health < 76) {
        bot.input = { up: false, down: false, left: false, right: false };
        continue;
      }

      if (distance < 8) {
        bot.botDecisionAt = 0;
        bot.input = { up: false, down: false, left: false, right: false };
        continue;
      }

      const targetMagnitude = Math.max(distance, 1);
      let steerX = dx / targetMagnitude;
      let steerY = dy / targetMagnitude;

      for (const other of this.players.values()) {
        if (!other.alive || other.id === bot.id) continue;
        let awayX = bot.x - other.x;
        let awayY = bot.y - other.y;
        let separation = Math.hypot(awayX, awayY);
        if (separation >= 90) continue;

        if (separation < 0.001) {
          awayX = bot.id < other.id ? -1 : 1;
          awayY = 0;
          separation = 1;
        }

        const normalizedX = awayX / separation;
        const normalizedY = awayY / separation;
        const repulsion = ((90 - separation) / 90) * 1.55;
        steerX += normalizedX * repulsion;
        steerY += normalizedY * repulsion;

        if (separation < 52) {
          const sidestep = ((52 - separation) / 52) * 1.1;
          steerX += -normalizedY * sidestep;
          steerY += normalizedX * sidestep;
        }
      }

      bot.input = {
        up: steerY < -0.18,
        down: steerY > 0.18,
        left: steerX < -0.18,
        right: steerX > 0.18,
      };
    }
  }

  updatePlayingStats(dt) {
    this.matchActiveTime += dt;
    for (const player of this.players.values()) {
      if (player.alive) player.playingTime += dt;
    }
  }

  movePlayers(dt) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const previousX = player.x;
      const previousY = player.y;
      const direction = normalizeInput(player.input);
      const speed = BALANCE.playerSpeed * (player.isBot ? BALANCE.botSpeedMultiplier : 1);
      player.vx = direction.x * speed;
      player.vy = direction.y * speed;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      clampPlayerToArena(player, this.arena);
      player.distanceCovered += Math.hypot(
        player.x - previousX,
        player.y - previousY,
      );
    }
  }

  resolvePlayerCollisions() {
    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    for (let i = 0; i < alivePlayers.length; i += 1) {
      for (let j = i + 1; j < alivePlayers.length; j += 1) {
        const a = alivePlayers[i];
        const b = alivePlayers[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius;
        if (distance >= minimum) continue;

        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const nx = dx / distance;
        const ny = dy / distance;
        const totalOverlap = minimum - distance;
        const aLocked = Boolean(a.occupiedNodeId);
        const bLocked = Boolean(b.occupiedNodeId);

        if (aLocked && !bLocked) {
          b.x += nx * totalOverlap;
          b.y += ny * totalOverlap;
        } else if (bLocked && !aLocked) {
          a.x -= nx * totalOverlap;
          a.y -= ny * totalOverlap;
        } else {
          const overlap = totalOverlap / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
        clampPlayerToArena(a, this.arena);
        clampPlayerToArena(b, this.arena);
      }
    }
  }

  releaseExitedNodes(now = Date.now()) {
    for (const node of this.arena.nodes) {
      if (!node.occupantId) continue;
      const occupant = this.players.get(node.occupantId);
      if (!occupant || !occupant.alive || distanceBetween(occupant, node) > node.radius + 7) {
        if (occupant) {
          occupant.occupiedNodeId = null;
          occupant.zone = 'field';
          if (occupant.alive) {
            occupant.nodeReentryLocks.set(node.id, now + BALANCE.nodeReentryLockMs);
          }
        }
        node.occupantId = null;
      }
    }
  }

  blockOccupiedNodes() {
    for (const node of this.arena.nodes) {
      if (!node.occupantId) continue;
      for (const player of this.players.values()) {
        if (!player.alive || player.id === node.occupantId) continue;
        let dx = player.x - node.x;
        let dy = player.y - node.y;
        let distance = Math.hypot(dx, dy);
        const minimum = node.radius + player.radius - 5;
        if (distance >= minimum) continue;

        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        player.x = node.x + (dx / distance) * minimum;
        player.y = node.y + (dy / distance) * minimum;
        clampPlayerToArena(player, this.arena);
      }
    }
  }

  blockPlayerLockedNodes(now = Date.now()) {
    for (const player of this.players.values()) {
      if (!player.alive || player.occupiedNodeId) continue;
      for (const [nodeId] of player.nodeReentryLocks) {
        if (!this.isNodeLockedForPlayer(player, nodeId, now)) continue;
        const node = this.arena.nodes.find((item) => item.id === nodeId);
        if (!node) continue;

        let dx = player.x - node.x;
        let dy = player.y - node.y;
        let distance = Math.hypot(dx, dy);
        const minimum = node.radius + player.radius - 5;
        if (distance >= minimum) continue;

        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        player.x = node.x + (dx / distance) * minimum;
        player.y = node.y + (dy / distance) * minimum;
        clampPlayerToArena(player, this.arena);
      }
    }
  }

  claimFreeNodes(now = Date.now()) {
    for (const node of this.arena.nodes) {
      if (node.occupantId) continue;

      const candidates = [...this.players.values()]
        .filter(
          (player) =>
            player.alive &&
            !player.occupiedNodeId &&
            !this.isNodeLockedForPlayer(player, node.id, now) &&
            distanceBetween(player, node) <= node.radius - 2,
        )
        .sort((a, b) => distanceBetween(a, node) - distanceBetween(b, node));

      const winner = candidates[0];
      if (!winner) continue;

      node.occupantId = winner.id;
      winner.occupiedNodeId = node.id;
      winner.zone = 'node';
      winner.x = node.x;
      winner.y = node.y;
      winner.vx = 0;
      winner.vy = 0;

      const isFreshNode = winner.lastNodeId !== node.id;
      if (isFreshNode) {
        winner.health = BALANCE.maxHealth;
        winner.lastNodeId = node.id;
        this.emitGameEvent('NODE_CLAIM', `${winner.name} captured a new node.`, {
          playerId: winner.id,
          nodeId: node.id,
        });
      }
    }
  }

  updateZonesAndStats(dt) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;

      if (player.occupiedNodeId) {
        player.zone = 'node';
        player.health -= BALANCE.nodeHealthDrainPerSecond * dt;
      } else {
        player.timer += BALANCE.timerRateOutsideNode * dt;
        const timerFraction = clamp(player.timer / this.roundTimerLimit, 0, 1);
        const pressureStart = BALANCE.criticalTimerFraction;
        const pressure = clamp(
          (timerFraction - pressureStart) / (1 - pressureStart),
          0,
          1,
        );
        const pressureDamage = pressure * BALANCE.timerPressureDamagePerSecond;

        if (isPointInsideCenterZone(player.x, player.y, this.arena.centerZone)) {
          player.zone = 'center';
          player.health += (BALANCE.centerHealthRecoveryPerSecond - pressureDamage) * dt;
        } else {
          player.zone = 'field';
          player.health -= (BALANCE.fieldHealthDrainPerSecond + pressureDamage) * dt;
        }
      }

      player.health = clamp(player.health, 0, BALANCE.maxHealth);
      player.timer = clamp(player.timer, 0, this.roundTimerLimit);
    }
  }

  evaluateEliminations() {
    const eliminated = [];
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (player.health <= 0) eliminated.push({ player, cause: 'Health depleted' });
      else if (player.timer >= this.roundTimerLimit) eliminated.push({ player, cause: 'Timer overloaded' });
    }

    for (const item of eliminated) {
      this.eliminatePlayer(item.player, item.cause, false);
    }

    if (eliminated.length > 0) this.afterEliminations();
  }

  eliminatePlayer(player, cause, autoTransition = true) {
    if (!player?.alive) return;
    player.alive = false;
    player.health = Math.max(0, player.health);
    player.eliminationCause = cause;
    player.vx = 0;
    player.vy = 0;

    if (player.occupiedNodeId) {
      const node = this.arena.nodes.find((item) => item.id === player.occupiedNodeId);
      if (node?.occupantId === player.id) node.occupantId = null;
      player.occupiedNodeId = null;
    }

    this.lastElimination = { playerId: player.id, name: player.name, cause };
    this.emitGameEvent('ELIMINATION', `${player.name} was eliminated: ${cause}.`, {
      playerId: player.id,
      cause,
    });
    if (autoTransition) this.afterEliminations();
  }

  afterEliminations() {
    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    if (alivePlayers.length <= 1) {
      this.status = 'gameover';
      this.stateEndsAt = null;
      this.winnerId = alivePlayers[0]?.id ?? null;
      const winnerName = alivePlayers[0]?.name ?? 'Nobody';
      this.emitGameEvent('GAME_OVER', `${winnerName} wins the match!`, {
        winnerId: this.winnerId,
      });
      this.broadcastSnapshot(true);
      return;
    }

    this.status = 'transition';
    this.stateEndsAt = Date.now() + BALANCE.transitionSeconds * 1000;
    for (const node of this.arena.nodes) node.occupantId = null;
    for (const player of alivePlayers) {
      player.occupiedNodeId = null;
      player.nodeReentryLocks.clear();
      player.timer = 0;
      player.zone = 'field';
      player.vx = 0;
      player.vy = 0;
    }
    this.round += 1;
    this.roundTimerLimit = Math.max(
      BALANCE.minimumRoundTimer,
      this.roundTimerLimit - BALANCE.roundTimerReduction,
    );
    this.arena = buildArena(this.arenaType, alivePlayers.length, this.maxPlayers);
    this.emitGameEvent(
      'ARENA_SHRINK',
      `Arena shrinking: ${alivePlayers.length} runners remain. Timer reset to ${this.roundTimerLimit}s.`,
    );
    this.broadcastSnapshot(true);
  }

  finishTransition() {
    this.positionAlivePlayers();
    this.beginCountdown(2.4);
  }

  tick(dt, now) {
    if (this.status === 'lobby') return;

    if (this.status === 'countdown') {
      if (this.stateEndsAt && now >= this.stateEndsAt) {
        this.status = 'playing';
        this.stateEndsAt = null;
        this.emitGameEvent('ROUND_START', `Round ${this.round} started.`);
      }
    } else if (this.status === 'transition') {
      if (this.stateEndsAt && now >= this.stateEndsAt) this.finishTransition();
    } else if (this.status === 'playing') {
      this.updatePlayingStats(dt);
      this.updateBots(now);
      this.movePlayers(dt);
      this.resolvePlayerCollisions();
      this.releaseExitedNodes(now);
      this.blockOccupiedNodes();
      this.blockPlayerLockedNodes(now);
      this.claimFreeNodes(now);
      this.updateZonesAndStats(dt);
      this.evaluateEliminations();
    }

    this.snapshotAccumulator += dt;
    if (this.snapshotAccumulator >= 1 / BALANCE.snapshotRate) {
      this.snapshotAccumulator = 0;
      this.broadcastSnapshot();
    }
  }

  emitGameEvent(type, message, data = {}) {
    this.eventCounter += 1;
    this.io.to(this.code).emit('game:event', {
      id: this.eventCounter,
      type,
      message,
      at: Date.now(),
      ...data,
    });
  }

  serializeLobby() {
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      gameMode: this.gameMode,
      humanSlots: this.humanSlots,
      botCount: this.botCount,
      arenaType: this.arenaType,
      players: [...this.players.values()]
        .filter((player) => !player.isBot)
        .map((player) => ({
          id: player.id,
          name: player.name,
          color: player.color,
          characterId: player.characterId,
          isHost: player.id === this.hostId,
        })),
    };
  }

  broadcastLobby() {
    this.io.to(this.code).emit('room:update', this.serializeLobby());
  }

  serializePlayer(player) {
    return {
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      color: player.color,
      characterId: player.characterId,
      x: Number(player.x.toFixed(2)),
      y: Number(player.y.toFixed(2)),
      vx: Number(player.vx.toFixed(2)),
      vy: Number(player.vy.toFixed(2)),
      radius: player.radius,
      health: Number(player.health.toFixed(2)),
      timer: Number(player.timer.toFixed(2)),
      distanceCovered: Number(player.distanceCovered.toFixed(2)),
      playingTime: Number(player.playingTime.toFixed(2)),
      efficiency: Number(
        (this.matchActiveTime > 0
          ? (player.playingTime / this.matchActiveTime) * 100
          : 0).toFixed(1),
      ),
      alive: player.alive,
      occupiedNodeId: player.occupiedNodeId,
      lastNodeId: player.lastNodeId,
      nodeReentryLocks: [...player.nodeReentryLocks.entries()]
        .filter(([, lockedUntil]) => lockedUntil > Date.now())
        .map(([nodeId, lockedUntil]) => ({ nodeId, lockedUntil })),
      zone: player.zone,
      lastInputSeq: player.lastInputSeq,
      botMode: player.botMode,
      eliminationCause: player.eliminationCause,
    };
  }

  snapshot() {
    return {
      serverTime: Date.now(),
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      round: this.round,
      stateEndsAt: this.stateEndsAt,
      winnerId: this.winnerId,
      maxHealth: BALANCE.maxHealth,
      maxTimer: this.roundTimerLimit,
      matchActiveTime: Number(this.matchActiveTime.toFixed(2)),
      nodeReentryLockMs: BALANCE.nodeReentryLockMs,
      world: WORLD,
      arena: this.arena,
      players: [...this.players.values()].map((player) => this.serializePlayer(player)),
    };
  }

  broadcastSnapshot(immediate = false) {
    if (immediate) this.snapshotAccumulator = 0;
    this.io.to(this.code).emit('game:snapshot', this.snapshot());
  }

  hasHumans() {
    return [...this.players.values()].some((player) => !player.isBot);
  }
}
