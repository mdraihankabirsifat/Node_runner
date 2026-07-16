import { InputController } from './InputController.js';
import { Renderer } from './Renderer.js';
import { UI } from './UI.js';

export class GameClient {
  constructor() {
    this.socket = window.io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 600,
    });
    this.localId = null;
    this.roomCode = null;
    this.latestSnapshot = null;
    this.inputSequence = 0;
    this.lastInputSentAt = 0;
    this.lastFrameAt = performance.now();

    this.input = new InputController();
    this.renderer = new Renderer(document.querySelector('#game-canvas'));
    this.ui = new UI({
      playBots: (setup) => this.playBots(setup),
      hostGame: (setup) => this.hostGame(setup),
      joinGame: (setup) => this.joinGame(setup),
      updateSettings: (settings) => this.updateSettings(settings),
      startGame: () => this.startGame(),
      leaveRoom: () => this.leaveRoom(),
    });

    this.bindSocketEvents();
    requestAnimationFrame((time) => this.frame(time));
  }

  bindSocketEvents() {
    this.socket.on('connect', () => {
      this.localId = this.socket.id;
      this.ui.setConnectionState('online');
      this.ui.setBusy(false);
    });

    this.socket.on('disconnect', () => {
      this.ui.setConnectionState('offline');
      this.input.setEnabled(false);
      this.ui.showToast('Connection lost. Trying to reconnect…');
    });

    this.socket.io.on('reconnect_attempt', () => this.ui.setConnectionState('connecting'));

    this.socket.on('room:update', (room) => {
      this.roomCode = room.code;
      this.ui.updateLobby(room, this.localId);
    });

    this.socket.on('game:snapshot', (snapshot) => {
      const firstGameSnapshot = !this.latestSnapshot || this.latestSnapshot.code !== snapshot.code;
      this.latestSnapshot = snapshot;
      this.roomCode = snapshot.code;
      if (firstGameSnapshot || !document.querySelector('#game-screen').classList.contains('active')) {
        this.ui.enterGame(snapshot, this.localId);
      }
      this.input.setEnabled(snapshot.status === 'playing');
      this.renderer.setSnapshot(snapshot, this.localId);
      this.ui.updateGame(snapshot, this.localId);
    });

    this.socket.on('game:event', (event) => {
      this.ui.addEvent(event);
      if (event.type === 'ELIMINATION' || event.type === 'GAME_OVER') this.ui.showToast(event.message);
    });
  }

  emitWithAck(eventName, payload = {}, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: 'Server response timed out.' });
      }, timeoutMs);

      this.socket.emit(eventName, payload, (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result ?? { ok: false, error: 'Invalid server response.' });
      });
    });
  }

  async playBots(setup) {
    this.ui.setBusy(true);
    this.ui.showMenuError('');
    const created = await this.emitWithAck('room:create', { ...setup, fillBots: true });
    if (!created.ok) {
      this.ui.showMenuError(created.error);
      this.ui.setBusy(false);
      return;
    }

    this.roomCode = created.code;
    this.ui.showLobby(created.room, this.localId);
    const started = await this.emitWithAck('room:start', {});
    if (!started.ok) {
      this.ui.showLobbyError(started.error);
      this.ui.setBusy(false);
    }
  }

  async hostGame(setup) {
    this.ui.setBusy(true);
    this.ui.showMenuError('');
    const result = await this.emitWithAck('room:create', { ...setup, fillBots: true });
    this.ui.setBusy(false);
    if (!result.ok) {
      this.ui.showMenuError(result.error);
      return;
    }

    this.roomCode = result.code;
    this.ui.showLobby(result.room, this.localId);
  }

  async joinGame(setup) {
    if (!setup.code || setup.code.length !== 5) {
      this.ui.showMenuError('Enter the complete 5-character room code.');
      return;
    }

    this.ui.setBusy(true);
    this.ui.showMenuError('');
    const result = await this.emitWithAck('room:join', setup);
    this.ui.setBusy(false);
    if (!result.ok) {
      this.ui.showMenuError(result.error);
      return;
    }

    this.roomCode = result.code;
    this.ui.showLobby(result.room, this.localId);
  }

  async updateSettings(settings) {
    const result = await this.emitWithAck('room:updateSettings', settings);
    if (!result.ok) this.ui.showLobbyError(result.error);
    else this.ui.showLobbyError('');
  }

  async startGame() {
    this.ui.showLobbyError('');
    const result = await this.emitWithAck('room:start', {});
    if (!result.ok) this.ui.showLobbyError(result.error);
  }

  async leaveRoom() {
    this.input.setEnabled(false);
    await this.emitWithAck('room:leave', {}, 1800);
    this.roomCode = null;
    this.latestSnapshot = null;
    this.renderer.clear();
    this.ui.resetToMenu();
  }

  sendInput(now) {
    if (!this.latestSnapshot || this.latestSnapshot.status !== 'playing') return;
    if (now - this.lastInputSentAt < 1000 / 30) return;
    this.lastInputSentAt = now;
    this.inputSequence += 1;
    this.socket.emit('game:input', {
      seq: this.inputSequence,
      ...this.input.getState(),
    });
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    const inputState = this.input.getState();
    this.sendInput(now);
    this.renderer.update(dt, inputState);
    requestAnimationFrame((time) => this.frame(time));
  }
}
