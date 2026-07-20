import { InputController } from './InputController.js?v=20260720-manual-start';
import { Renderer } from './Renderer.js?v=20260720-manual-start';
import { UI } from './UI.js?v=20260720-intro-update';
import { AudioManager } from './AudioManager.js?v=20260720-intro-update';
import { PlayerPreferences } from './PlayerPreferences.js?v=20260720-intro-update';

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
    this.isPaused = false;
    this.preferences = new PlayerPreferences();
    this.audio = new AudioManager(this.preferences.getSettings());

    this.input = new InputController();
    this.renderer = new Renderer(document.querySelector('#game-canvas'));
    this.pauseOverlay = document.querySelector('#pause-overlay');
    this.ui = new UI({
      playBots: (setup) => this.playBots(setup),
      hostGame: (setup) => this.hostGame(setup),
      joinGame: (setup) => this.joinGame(setup),
      updateSettings: (settings) => this.updateSettings(settings),
      selectCharacter: (characterId) => this.selectCharacter(characterId),
      startGame: (characterId) => this.startGame(characterId),
      leaveRoom: () => this.leaveRoom(),
      saveAudioSettings: (settings) => this.saveAudioSettings(settings),
      resetProgress: () => this.resetProgress(),
      playSettingsMusic: () => this.audio.playSettingsMusic(),
      stopSettingsMusic: () => this.audio.stopSettingsMusic(),
    }, {
      audioSettings: this.preferences.getSettings(),
      profile: this.preferences.getProfile(),
    });

    const unlockAudio = () => this.audio.unlock().catch(() => {});
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('keydown', (event) => {
      if (event.repeat || event.code !== 'KeyQ') return;
      if (!this.isGameScreenActive()) return;
      if (!this.latestSnapshot || this.latestSnapshot.status === 'gameover') return;
      event.preventDefault();
      this.togglePause();
    });
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        this.audio.playEffect('click');
      }
    });

    this.bindSocketEvents();
    this.audio.playBGM('introSequence');
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
      if (snapshot.status === 'lobby') {
        this.input.setEnabled(false);
        return;
      }

      const firstGameSnapshot = !this.latestSnapshot || this.latestSnapshot.code !== snapshot.code;
      this.latestSnapshot = snapshot;
      this.roomCode = snapshot.code;
      if (snapshot.status === 'gameover') {
        this.setPaused(false, { silent: true });
      }
      if (firstGameSnapshot || !document.querySelector('#game-screen').classList.contains('active')) {
        this.ui.enterGame(snapshot, this.localId);
        this.audio.playBGM('gameStart');
      }
      if (this.isPaused && snapshot.status !== 'gameover') {
        return;
      }

      this.input.setEnabled(snapshot.status === 'playing');
      this.renderer.setSnapshot(snapshot, this.localId);
      this.ui.updateGame(snapshot, this.localId);
      if (snapshot.status === 'gameover') this.recordMatch(snapshot);
    });

    this.socket.on('game:event', (event) => {
      this.ui.addEvent(event);
      this.audio.playEffect(event.type);
      if (event.type === 'ELIMINATION' || event.type === 'GAME_OVER') this.ui.showToast(event.message);
    });
  }

  saveAudioSettings(settings) {
    const saved = this.preferences.updateSettings(settings);
    this.audio.applySettings(saved);
    return saved;
  }

  resetProgress() {
    return this.preferences.resetProfile();
  }

  recordMatch(snapshot) {
    const localPlayer = snapshot.players.find((player) => player.id === this.localId && !player.isBot);
    if (!localPlayer) return;
    const result = this.preferences.recordMatch(snapshot.matchId, {
      won: snapshot.winnerId === this.localId,
      distanceCovered: localPlayer.distanceCovered,
      playingTime: localPlayer.playingTime,
      efficiency: localPlayer.efficiency,
    });
    if (!result.recorded) return;
    this.ui.renderProfile(result.profile);
    if (result.unlocked.length > 0) {
      this.audio.playEffect('achievement');
      const names = result.unlocked.map((achievement) => achievement.title).join(', ');
      this.ui.showToast(`Achievement unlocked: ${names}`);
    }
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
    const created = await this.emitWithAck('room:create', setup);
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
    const result = await this.emitWithAck('room:create', setup);
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

  async selectCharacter(characterId) {
    const result = await this.emitWithAck('room:setCharacter', { characterId });
    if (!result.ok) this.ui.showLobbyError(result.error);
    else this.ui.showLobbyError('');
    return result;
  }

  async startGame(characterId = null) {
    this.ui.showLobbyError('');
    const result = await this.emitWithAck('room:start', { characterId });
    if (!result.ok) this.ui.showLobbyError(result.error);
  }

  async leaveRoom() {
    this.setPaused(false, { silent: true });
    this.input.setEnabled(false);
    await this.emitWithAck('room:leave', {}, 1800);
    this.roomCode = null;
    this.latestSnapshot = null;
    this.renderer.clear();
    this.audio.playBGM('lobby');
    this.ui.resetToMenu();
  }

  sendInput(now) {
    if (this.isPaused) {
      this.audio.stopMovement();
      return;
    }

    if (!this.latestSnapshot || this.latestSnapshot.status !== 'playing') {
      this.audio.stopMovement();
      return;
    }
    
    const inputState = this.input.getState();
    const isMoving = inputState.up || inputState.down || inputState.left || inputState.right;
    if (isMoving) {
      this.audio.startMovement();
    } else {
      this.audio.stopMovement();
    }

    if (now - this.lastInputSentAt < 1000 / 30) return;
    this.lastInputSentAt = now;
    this.inputSequence += 1;
    this.socket.emit('game:input', {
      seq: this.inputSequence,
      ...inputState,
    });
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    if (this.isPaused) {
      requestAnimationFrame((time) => this.frame(time));
      return;
    }
    const inputState = this.input.getState();
    this.sendInput(now);
    this.renderer.update(dt, inputState);
    requestAnimationFrame((time) => this.frame(time));
  }

  isGameScreenActive() {
    return document.querySelector('#game-screen').classList.contains('active');
  }

  togglePause() {
    this.setPaused(!this.isPaused);
  }

  setPaused(paused, { silent = false } = {}) {
    if (this.isPaused === paused) {
      if (!paused && !silent && this.latestSnapshot) {
        this.refreshGameView();
      }
      return;
    }

    this.isPaused = paused;
    if (this.pauseOverlay) {
      this.pauseOverlay.classList.toggle('hidden', !paused);
    }

    this.input.setEnabled(!paused && this.latestSnapshot?.status === 'playing');
    if (paused) {
      this.audio.stopMovement();
    } else if (!silent) {
      this.refreshGameView();
    } else if (this.latestSnapshot?.status === 'gameover') {
      this.refreshGameView();
    }
  }

  refreshGameView() {
    if (!this.latestSnapshot) return;
    this.renderer.setSnapshot(this.latestSnapshot, this.localId);
    this.ui.updateGame(this.latestSnapshot, this.localId);
    if (this.latestSnapshot.status === 'gameover') this.recordMatch(this.latestSnapshot);
  }
}
