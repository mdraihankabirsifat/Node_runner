import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { BALANCE } from './server/constants.js';
import { GameRoom } from './server/GameRoom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 8000,
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders(response) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
  },
}));
app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'node-runner',
  });
});

const rooms = new Map();

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < 5; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not generate a unique room code.');
}

function normalizedCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function callbackSafe(callback, result) {
  if (typeof callback === 'function') callback(result);
}

function scheduleMixedAutoStart(room) {
  if (!room?.isMixedReadyToStart()) return;
  setImmediate(() => {
    if (room.isMixedReadyToStart()) room.start(room.hostId);
  });
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload = {}, callback) => {
    try {
      const existingCode = socket.data.roomCode;
      if (existingCode) {
        const existingRoom = rooms.get(existingCode);
        existingRoom?.removeHuman(socket.id, 'left');
        socket.leave(existingCode);
      }

      const code = createRoomCode();
      const room = new GameRoom(io, code, payload, socket);
      rooms.set(code, room);
      callbackSafe(callback, {
        ok: true,
        code,
        playerId: socket.id,
        room: room.serializeLobby(),
      });
    } catch (error) {
      console.error('room:create failed', error);
      callbackSafe(callback, { ok: false, error: 'Could not create the room.' });
    }
  });

  socket.on('room:join', (payload = {}, callback) => {
    const code = normalizedCode(payload.code);
    const room = rooms.get(code);
    if (!room) {
      callbackSafe(callback, { ok: false, error: 'Room code not found.' });
      return;
    }

    const currentRoomCode = socket.data.roomCode;
    if (currentRoomCode && currentRoomCode !== code) {
      const currentRoom = rooms.get(currentRoomCode);
      currentRoom?.removeHuman(socket.id, 'left');
      socket.leave(currentRoomCode);
    }

    const result = room.addHuman(socket, payload.name);
    callbackSafe(callback, {
      ...result,
      code,
      room: result.ok ? room.serializeLobby() : undefined,
    });
    if (result.ok) scheduleMixedAutoStart(room);
  });

  socket.on('room:updateSettings', (payload = {}, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) {
      callbackSafe(callback, { ok: false, error: 'You are not in a room.' });
      return;
    }
    const result = room.updateSettings(socket.id, payload);
    callbackSafe(callback, result);
    if (result.ok) scheduleMixedAutoStart(room);
  });

  socket.on('room:start', (_payload, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) {
      callbackSafe(callback, { ok: false, error: 'You are not in a room.' });
      return;
    }
    callbackSafe(callback, room.start(socket.id));
  });

  socket.on('room:leave', (_payload, callback) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (room) room.removeHuman(socket.id, 'left');
    if (code) socket.leave(code);
    socket.data.roomCode = null;
    callbackSafe(callback, { ok: true });
  });

  socket.on('game:input', (payload = {}) => {
    const room = rooms.get(socket.data.roomCode);
    room?.setInput(socket.id, payload);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.removeHuman(socket.id, 'disconnect');
    if (!room.hasHumans()) rooms.delete(code);
  });
});

const fixedDt = 1 / BALANCE.tickRate;
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.tick(fixedDt, now);
    if (!room.hasHumans() || now - room.lastActivityAt > BALANCE.roomIdleDeleteMs) {
      rooms.delete(code);
    }
  }
}, 1000 / BALANCE.tickRate);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Node Runner server is running at http://localhost:${PORT}`);
});
