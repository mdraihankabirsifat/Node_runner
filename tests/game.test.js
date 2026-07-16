import assert from 'node:assert/strict';
import test from 'node:test';
import { GameRoom } from '../server/GameRoom.js';
import { buildArena } from '../server/arena.js';
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
    { name: 'Host', maxPlayers, arenaType: 'polygon', fillBots: true },
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

test('re-entering the same node does not heal again', () => {
  const { room } = createRoom(4);
  const player = room.players.get('host');
  const node = room.arena.nodes[0];

  player.x = node.x;
  player.y = node.y;
  room.claimFreeNodes();
  assert.equal(player.health, BALANCE.maxHealth);

  player.x = WORLD.centerX;
  player.y = WORLD.centerY;
  room.releaseExitedNodes();
  player.health = 27;
  player.x = node.x;
  player.y = node.y;
  room.claimFreeNodes();

  assert.equal(player.health, 27);
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
