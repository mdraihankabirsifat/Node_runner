import assert from 'node:assert/strict';
import test from 'node:test';
import { GameRoom } from '../server/GameRoom.js';
import { buildArena, clampPlayerToArena } from '../server/arena.js';
import { BALANCE, WORLD } from '../server/constants.js';

function makeFakeIo() {
  return {
    events: [],
    to(code) {
      return {
        emit: (name, payload) => {
          this.events.push({ code, name, payload });
        },
      };
    },
  };
}

function makeSocket(id = 'host') {
  return {
    id,
    data: {},
    join() {},
  };
}

function createRoom(maxPlayers = 4) {
  const io = makeFakeIo();
  const socket = makeSocket();
  const room = new GameRoom(
    io,
    'ABCDE',
    { name: 'Host', maxPlayers, arenaType: 'polygon', gameMode: 'bot' },
    socket,
  );
  room.start(socket.id);
  room.status = 'playing';
  room.stateEndsAt = null;
  return { room, io, socket };
}

test('arena always has one fewer active node than alive players', () => {
  for (let players = 2; players <= 8; players += 1) {
    for (const type of ['polygon', 'football', 'circle']) {
      const arena = buildArena(type, players, 8);
      assert.equal(arena.nodes.length, players - 1);
      assert.equal(arena.activeNodeCount, players - 1);
      assert.ok(arena.geometrySides >= 3);
    }
  }
});

test('with three players, polygon mode uses a square with diagonal nodes', () => {
  const arena = buildArena('polygon', 3, 4);
  const [firstNode, secondNode] = arena.nodes;
  const [topLeft, topRight, bottomRight, bottomLeft] = arena.boundary.vertices;

  assert.equal(arena.geometrySides, 4);
  assert.equal(arena.nodes.length, 2);
  assert.ok(Math.abs(topLeft.y - topRight.y) < 0.001);
  assert.ok(Math.abs(bottomLeft.y - bottomRight.y) < 0.001);
  assert.ok(Math.abs(firstNode.x - topLeft.x) < 0.001);
  assert.ok(Math.abs(firstNode.y - topLeft.y) < 0.001);
  assert.ok(Math.abs(secondNode.x - bottomRight.x) < 0.001);
  assert.ok(Math.abs(secondNode.y - bottomRight.y) < 0.001);

  const player = { x: secondNode.x, y: secondNode.y, radius: BALANCE.playerRadius };
  clampPlayerToArena(player, arena);
  assert.ok(
    Math.hypot(player.x - secondNode.x, player.y - secondNode.y)
      <= secondNode.radius - 2,
  );
});

test('with two players, polygon mode keeps a triangle and one node', () => {
  const arena = buildArena('polygon', 2, 4);
  assert.equal(arena.geometrySides, 3);
  assert.equal(arena.boundary.vertices.length, 3);
  assert.equal(arena.nodes.length, 1);
});

test('the initial exposure timer limit is 30 seconds', () => {
  assert.equal(BALANCE.maxTimer, 30);
});

test('elimination transition stays on screen for the six second cue', () => {
  assert.equal(BALANCE.transitionSeconds, 6);
});

test('each match restart receives a stable, unique match id for saved records', () => {
  const { room, socket } = createRoom(3);
  const firstMatchId = room.snapshot().matchId;
  assert.match(firstMatchId, /^ABCDE-/);

  room.status = 'gameover';
  assert.equal(room.start(socket.id).ok, true);
  const secondMatchId = room.snapshot().matchId;
  assert.notEqual(secondMatchId, firstMatchId);
  assert.equal(room.snapshot().matchId, secondMatchId);
});

test('matches are capped at seven uniquely assigned characters', () => {
  const { room } = createRoom(99);
  const players = [...room.players.values()];
  const characterIds = players.map((player) => player.characterId);

  assert.equal(room.maxPlayers, 7);
  assert.equal(players.length, 7);
  assert.deepEqual(new Set(characterIds), new Set([1, 2, 3, 4, 5, 6, 7]));
  assert.deepEqual(
    room.snapshot().players.map((player) => player.characterId),
    characterIds,
  );
});

test('human players can choose an available character in the lobby', () => {
  const room = new GameRoom(
    makeFakeIo(),
    'PICKS',
    {
      name: 'Host',
      maxPlayers: 3,
      arenaType: 'polygon',
      gameMode: 'human',
      characterId: 6,
    },
    makeSocket('host'),
  );
  room.addHuman(makeSocket('guest'), 'Guest', 6);

  assert.equal(room.players.get('host').characterId, 6);
  assert.equal(room.players.get('guest').characterId, null);
  assert.equal(room.setCharacter('host', 7).ok, true);
  assert.equal(room.players.get('host').characterId, 7);
  assert.equal(room.setCharacter('guest', 7).ok, false);
  assert.notEqual(room.players.get('guest').characterId, 7);
  assert.equal(room.setCharacter('guest', 99).ok, false);

  room.addHuman(makeSocket('guest-2'), 'Guest 2');
  assert.equal(room.start('host', 5).ok, false);
  assert.equal(room.setCharacter('guest', 1).ok, true);
  assert.equal(room.setCharacter('guest-2', 2).ok, true);
  assert.equal(room.start('host', 5).ok, true);
  assert.equal(
    room.snapshot().players.find((player) => player.id === 'host').characterId,
    5,
  );
});

test('lobby ticks do not emit game snapshots or dismiss character selection', () => {
  const io = makeFakeIo();
  const room = new GameRoom(
    io,
    'LOBBY',
    { name: 'Host', maxPlayers: 3, arenaType: 'polygon', gameMode: 'human' },
    makeSocket('host'),
  );
  const snapshotsBeforeTick = io.events.filter(
    (event) => event.name === 'game:snapshot',
  ).length;

  room.tick(1, Date.now());

  const snapshotsAfterTick = io.events.filter(
    (event) => event.name === 'game:snapshot',
  ).length;
  assert.equal(snapshotsAfterTick, snapshotsBeforeTick);
  assert.equal(room.status, 'lobby');
});

test('a node accepts only one player and blocks another runner', () => {
  const { room } = createRoom(4);
  const [first, second] = [...room.players.values()];
  const node = room.arena.nodes[0];

  first.x = node.x;
  first.y = node.y;
  second.x = node.x;
  second.y = node.y;
  room.claimFreeNodes();

  assert.equal(node.occupantId, first.id);
  assert.equal(first.occupiedNodeId, node.id);
  assert.equal(second.occupiedNodeId, null);

  room.blockOccupiedNodes();
  const distance = Math.hypot(second.x - node.x, second.y - node.y);
  assert.ok(distance >= node.radius + second.radius - 5 - 0.001);
});

test('blocked collision velocity matches the final corrected position', () => {
  const { room } = createRoom(4);
  const [runner, blocker] = [...room.players.values()];
  const dt = 1 / BALANCE.tickRate;

  runner.x = 500;
  runner.y = 360;
  runner.input = { up: false, down: false, left: false, right: true };
  blocker.x = runner.x + runner.radius + blocker.radius;
  blocker.y = runner.y;
  blocker.input = { up: false, down: false, left: false, right: false };
  blocker.occupiedNodeId = 'locked-node';

  const movementStart = room.beginMovementFrame();
  room.movePlayers(dt, false);
  room.resolvePlayerCollisions();
  room.finalizeMovementFrame(movementStart, dt);

  assert.ok(Math.abs(runner.x - movementStart.get(runner.id).x) < 0.001);
  assert.equal(room.serializePlayer(runner).vx, 0);
  assert.equal(room.serializePlayer(runner).vy, 0);
});

test('a fresh node restores health and pauses the timer', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  const node = room.arena.nodes[0];

  player.health = 20;
  player.timer = 13;
  player.x = node.x;
  player.y = node.y;
  room.claimFreeNodes();

  assert.equal(player.health, BALANCE.maxHealth);
  const timerBefore = player.timer;
  room.updateZonesAndStats(1);
  assert.equal(player.timer, timerBefore);
  assert.equal(player.health, BALANCE.maxHealth - BALANCE.nodeHealthDrainPerSecond);
});

test('leaving a node locks it for that player for three seconds', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  const node = room.arena.nodes[0];

  player.x = node.x;
  player.y = node.y;
  room.claimFreeNodes(1000);
  assert.equal(player.health, BALANCE.maxHealth);

  player.x = WORLD.centerX;
  player.y = WORLD.centerY;
  room.releaseExitedNodes(2000);
  player.health = 27;
  player.x = node.x;
  player.y = node.y;
  room.claimFreeNodes(4999);

  assert.equal(player.occupiedNodeId, null);
  assert.equal(player.health, 27);

  room.claimFreeNodes(5000);
  assert.equal(player.occupiedNodeId, node.id);
  assert.equal(player.health, 27);
});

test('a node cooldown is personal and does not lock out another player', () => {
  const { room } = createRoom(4);
  const [first, second] = [...room.players.values()];
  const node = room.arena.nodes[0];

  first.x = node.x;
  first.y = node.y;
  room.claimFreeNodes(1000);
  first.x = WORLD.centerX;
  first.y = WORLD.centerY;
  room.releaseExitedNodes(1500);

  second.x = node.x;
  second.y = node.y;
  room.claimFreeNodes(1600);

  assert.equal(node.occupantId, second.id);
  assert.equal(second.occupiedNodeId, node.id);
});

test('center heals health but continues the exposure timer', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  player.occupiedNodeId = null;
  player.x = WORLD.centerX;
  player.y = WORLD.centerY;
  player.health = 50;
  player.timer = 20;

  room.updateZonesAndStats(1);

  assert.equal(player.zone, 'center');
  assert.equal(player.timer, 21);
  assert.equal(player.health, 50 + BALANCE.centerHealthRecoveryPerSecond);
});

test('timer overload eliminates a runner and shrinks the arena', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  player.timer = BALANCE.maxTimer;

  room.evaluateEliminations();

  assert.equal(player.alive, false);
  assert.equal(player.eliminationCause, 'Timer overloaded');
  assert.equal(room.status, 'transition');
  const aliveCount = [...room.players.values()].filter((candidate) => candidate.alive).length;
  assert.equal(room.arena.nodes.length, aliveCount - 1);
});

test('shrinking resets survivor timers and lowers the next limit by five seconds', () => {
  const { room } = createRoom(4);
  const eliminated = room.players.get('host');
  for (const player of room.players.values()) player.timer = 18;
  eliminated.health = 0;

  room.evaluateEliminations();

  assert.equal(room.status, 'transition');
  assert.equal(room.round, 2);
  assert.equal(room.roundTimerLimit, 25);
  for (const player of room.players.values()) {
    if (player.alive) assert.equal(player.timer, 0);
  }
  assert.equal(room.snapshot().maxTimer, 25);
});

test('the next round countdown starts when the elimination page ends', () => {
  const { room } = createRoom(4);
  const eliminated = room.players.get('host');
  eliminated.health = 0;

  room.evaluateEliminations();
  assert.equal(room.status, 'transition');
  assert.ok(room.stateEndsAt);

  room.tick(1 / BALANCE.tickRate, room.stateEndsAt);

  assert.equal(room.status, 'countdown');
  assert.ok(room.stateEndsAt);

  room.tick(1 / BALANCE.tickRate, room.stateEndsAt);

  assert.equal(room.status, 'playing');
  assert.equal(room.stateEndsAt, null);
});

test('distance, playing time, and efficiency are serialized for every player', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  player.input = { up: false, down: false, left: false, right: true };

  room.updatePlayingStats(1);
  room.movePlayers(1);
  const serialized = room.serializePlayer(player);

  assert.equal(serialized.playingTime, 1);
  assert.ok(serialized.distanceCovered > 0);
  assert.equal(serialized.efficiency, 100);
});

test('nearby bots choose opposite sidesteps instead of pushing head-on', () => {
  const { room } = createRoom(4);
  const bots = [...room.players.values()].filter((player) => player.isBot);
  const [leftBot, rightBot] = bots;

  for (const player of room.players.values()) {
    player.x = 100;
    player.y = 100;
  }
  leftBot.x = 600;
  leftBot.y = 360;
  rightBot.x = 632;
  rightBot.y = 360;
  for (const bot of [leftBot, rightBot]) {
    bot.botTarget = { x: 640, y: 360, nodeId: 'test-node' };
    bot.botMode = 'SEEK_NODE';
    bot.botDecisionAt = 2000;
  }

  room.updateBots(1000);

  assert.equal(leftBot.input.up, true);
  assert.equal(rightBot.input.down, true);
});

test('mixed mode waits for its human slots and then adds the exact bot count', () => {
  const io = makeFakeIo();
  const host = makeSocket('host');
  const room = new GameRoom(
    io,
    'MIXED',
    {
      name: 'Host',
      gameMode: 'mix',
      humanPlayers: 2,
      botCount: 2,
      arenaType: 'polygon',
    },
    host,
  );

  assert.equal(room.humanSlots, 2);
  assert.equal(room.botCount, 2);
  assert.equal(room.maxPlayers, 4);
  assert.equal(room.start(host.id).ok, false);

  const guest = makeSocket('guest');
  assert.equal(room.addHuman(guest, 'Guest').ok, true);
  assert.equal(room.serializeLobby().players.length, 2);
  assert.equal(room.isMixedReadyToStart(), false);
  assert.equal(room.start(host.id).ok, false);
  assert.equal(room.setCharacter(host.id, 1).ok, true);
  assert.equal(room.setCharacter(guest.id, 2).ok, true);
  assert.equal(room.isMixedReadyToStart(), true);
  assert.equal(room.start(host.id).ok, true);
  assert.equal([...room.players.values()].filter((player) => player.isBot).length, 2);
  assert.equal(room.players.size, 4);
});

test('human mode keeps a minimum of three humans and never adds bots', () => {
  const io = makeFakeIo();
  const host = makeSocket('host');
  const room = new GameRoom(
    io,
    'HUMAN',
    {
      name: 'Host',
      gameMode: 'human',
      maxPlayers: 2,
      arenaType: 'polygon',
    },
    host,
  );

  assert.equal(room.humanSlots, 3);
  assert.equal(room.botCount, 0);
  for (const id of ['guest-1', 'guest-2']) {
    assert.equal(room.addHuman(makeSocket(id), id).ok, true);
  }
  assert.equal(room.start(host.id).ok, false);
  ['host', 'guest-1', 'guest-2'].forEach((id, index) => {
    assert.equal(room.setCharacter(id, index + 1).ok, true);
  });
  assert.equal(room.start(host.id).ok, true);
  assert.equal([...room.players.values()].some((player) => player.isBot), false);
});

test('mixed mode enforces a minimum combined total of three runners', () => {
  const room = new GameRoom(
    makeFakeIo(),
    'MIN3',
    {
      name: 'Host',
      gameMode: 'mix',
      humanPlayers: 2,
      botCount: 0,
      arenaType: 'polygon',
    },
    makeSocket('host'),
  );

  assert.equal(room.humanSlots, 2);
  assert.equal(room.botCount, 1);
  assert.equal(room.maxPlayers, 3);
});
