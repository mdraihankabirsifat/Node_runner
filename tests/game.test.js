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

test('with three players, the lower polygon node stays on the triangle base', () => {
  const arena = buildArena('polygon', 3, 4);
  const [, lowerNode] = arena.nodes;
  const [, lowerRight, lowerLeft] = arena.boundary.vertices;

  assert.equal(arena.geometrySides, 3);
  assert.equal(arena.nodes.length, 2);
  assert.ok(Math.abs(lowerNode.y - lowerRight.y) < 0.001);
  assert.ok(Math.abs(lowerNode.y - lowerLeft.y) < 0.001);
  assert.ok(lowerNode.x > lowerLeft.x);
  assert.ok(lowerNode.x < lowerRight.x);

  const player = { x: lowerNode.x, y: lowerNode.y, radius: BALANCE.playerRadius };
  clampPlayerToArena(player, arena);
  assert.ok(
    Math.hypot(player.x - lowerNode.x, player.y - lowerNode.y)
      <= lowerNode.radius - 2,
  );
});

test('the exposure timer limit is 45 seconds', () => {
  assert.equal(BALANCE.maxTimer, 45);
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
  assert.equal(room.start(host.id).ok, true);
  assert.equal([...room.players.values()].filter((player) => player.isBot).length, 2);
  assert.equal(room.players.size, 4);
});

test('human mode keeps a minimum of four humans and never adds bots', () => {
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

  assert.equal(room.humanSlots, 4);
  assert.equal(room.botCount, 0);
  for (const id of ['guest-1', 'guest-2', 'guest-3']) {
    assert.equal(room.addHuman(makeSocket(id), id).ok, true);
  }
  assert.equal(room.start(host.id).ok, true);
  assert.equal([...room.players.values()].some((player) => player.isBot), false);
});
