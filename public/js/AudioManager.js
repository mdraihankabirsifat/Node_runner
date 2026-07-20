export class AudioManager {
  constructor(settings) {
    this.settings = { ...settings };
    this.audioContext = null;
    this.fadeInterval = null;
    this.currentBgmId = null;
    this.currentLobbyIndex = 0;
    this.specialCueDepth = 0;
    this.interruptedBgmId = null;
    this.eliminationCueUntil = 0;
    this.settingsPreviewTrackId = null;
    this.settingsPreviewPreviousBgmId = null;
    this.settingsPreviewPreviousWasPlaying = false;
    this.settingsSoundPreviewTimer = null;

    this.trackOrder = ['lobby1', 'lobby2', 'lobby3'];

    this.assets = {
      lobby1: { src: '/music/lobby sampe 1.mp3', kind: 'music', loop: true, volumeScale: 0.4 },
      lobby2: { src: '/music/lobby sample 2.mp3', kind: 'music', loop: true, volumeScale: 0.4 },
      lobby3: { src: '/music/lobby sample 3.mp3', kind: 'music', loop: true, volumeScale: 0.4 },
      gameStart: { src: '/music/game_start.mp3', kind: 'music', loop: false, volumeScale: 0.4 },
      gameplay: { src: '/music/gameplay background.mp3', kind: 'music', loop: true, volumeScale: 0.4 },
      running: { src: '/music/running.mp3', kind: 'sfx', loop: true, volumeScale: 1 },
      nodeReach: { src: '/music/individual_node_reach.wav', kind: 'sfx', loop: false, volumeScale: 1 },
      roundEnd: { src: '/music/fahhhhh.mp3', kind: 'sfx', loop: false, volumeScale: 1 },
      elimination: { src: '/music/me_bhaga_bhaga.mp3', kind: 'sfx', loop: false, volumeScale: 1 },
      intro: { src: '/music/intro.mp3', kind: 'music', loop: false, volumeScale: 0.4 },
    };

    this.audioElements = new Map();
    for (const [id, asset] of Object.entries(this.assets)) {
      this.audioElements.set(id, this.createAudioElement(id, asset));
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseAll('tab hidden');
        return;
      }

      if (this.settings.musicEnabled && this.settings.musicVolume > 0 && this.currentBgmId) {
        this.playCurrentBgm('tab visible').catch(() => {});
      }
    });

    this.audioElements.get('gameStart')?.addEventListener('ended', () => {
      if (this.currentBgmId === 'gameStart') {
        this.playBGM('gameplay', false);
      }
    });
  }

  async unlock() {
    await this.resumeAudioContext('user interaction');

    if (this.settings.musicEnabled && this.settings.musicVolume > 0 && this.currentBgmId) {
      await this.playCurrentBgm('user interaction');
    }
  }

  applySettings(settings, options = {}) {
    const { resumeMusic = true } = options;
    this.settings = { ...settings };
    this.updateVolumes();

    if (this.settings.musicEnabled && this.settings.musicVolume > 0) {
      if (resumeMusic && this.currentBgmId) {
        this.playCurrentBgm('settings changed').catch(() => {});
      }
    } else {
      this.pauseCurrentMusic('music disabled');
    }

    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) {
      this.pauseAudio('running', 'sound disabled');
      this.pauseAudio('nodeReach', 'sound disabled');
    }
  }

  updateVolumes() {
    for (const [id, audio] of this.audioElements) {
      const asset = this.assets[id];
      if (!asset) continue;
      const volume = asset.kind === 'music'
        ? (this.settings.musicVolume / 100) * asset.volumeScale
        : (this.settings.soundVolume / 100) * asset.volumeScale;
      audio.volume = volume;
    }
  }

  playBGM(trackId, fade = true) {
    if (trackId === 'introSequence') {
      return this.playIntroSequence();
    }
    if (trackId === 'lobby') {
      return this.playLobbyBGM(fade);
    }

    return this.playSpecificBGM(trackId, fade);
  }

  playLobbyBGM(fade = true) {
    if (this.currentBgmId && this.isLobbyTrack(this.currentBgmId)) {
      const currentIndex = this.trackOrder.indexOf(this.currentBgmId);
      if (currentIndex >= 0) {
        this.currentLobbyIndex = (currentIndex + 1) % this.trackOrder.length;
      }
    }

    const nextTrackId = this.trackOrder[this.currentLobbyIndex] ?? 'lobby1';
    this.currentLobbyIndex = (this.currentLobbyIndex + 1) % this.trackOrder.length;
    return this.switchMusic(nextTrackId, fade, 'lobby');
  }

  playSpecificBGM(trackId, fade = true) {
    if (!this.audioElements.has(trackId)) {
      console.error(`[Audio] Unknown track requested: ${trackId}`);
      return Promise.resolve();
    }

    if (trackId === this.currentBgmId) {
      return this.playCurrentBgm('same track');
    }

    if (trackId === 'gameplay' || trackId === 'gameStart') {
      this.currentLobbyIndex = 0;
    }

    return this.switchMusic(trackId, fade, trackId);
  }

  playIntroSequence() {
    this.playSpecificBGM('intro', false);
    setTimeout(() => {
      if (this.currentBgmId === 'intro') {
        this.playLobbyBGM(true);
      }
    }, 5000);
  }

  async switchMusic(trackId, fade, reason) {
    const currentAudio = this.currentBgmId ? this.audioElements.get(this.currentBgmId) : null;
    if (fade && currentAudio && !currentAudio.paused) {
      await this.fadeOutAndStop(currentAudio, reason);
    }

    this.currentBgmId = trackId;
    const nextAudio = this.audioElements.get(trackId);
    if (!nextAudio) return;

    nextAudio.loop = this.assets[trackId].loop;
    this.updateVolumes();

    if (this.settings.musicEnabled && this.settings.musicVolume > 0 && !document.hidden) {
      await this.playAudioElement(trackId, reason);
    }
  }

  async playCurrentBgm(reason = 'resume') {
    if (!this.currentBgmId) return;
    const audio = this.audioElements.get(this.currentBgmId);
    if (!audio) return;

    if (audio.paused) {
      await this.playAudioElement(this.currentBgmId, reason);
    }
  }

  async fadeOutAndStop(audio, reason) {
    if (this.fadeInterval) clearInterval(this.fadeInterval);

    const startVol = audio.volume;
    const steps = 10;
    const stepTime = 25;

    await new Promise((resolve) => {
      let currentStep = 0;
      this.fadeInterval = setInterval(() => {
        currentStep += 1;
        if (currentStep >= steps) {
          clearInterval(this.fadeInterval);
          audio.pause();
          audio.currentTime = 0;
          audio.volume = startVol;
          console.info(`[Audio] Stopping ${this.getFileNameByAudio(audio)} (${reason})`);
          resolve();
          return;
        }

        audio.volume = startVol * (1 - currentStep / steps);
      }, stepTime);
    });
  }

  playSettingsMusic() {
    if (this.settingsPreviewTrackId) return;
    const previousAudio = this.currentBgmId ? this.audioElements.get(this.currentBgmId) : null;
    this.settingsPreviewPreviousBgmId = this.currentBgmId;
    this.settingsPreviewPreviousWasPlaying = Boolean(previousAudio && !previousAudio.paused);
    this.playBGM('lobby', false);
    this.settingsPreviewTrackId = this.currentBgmId;
  }

  stopSettingsMusic() {
    clearTimeout(this.settingsSoundPreviewTimer);
    this.settingsSoundPreviewTimer = null;
    this.pauseAudio('nodeReach', 'settings sound preview closed');

    if (!this.settingsPreviewTrackId) return;

    const previewTrackId = this.settingsPreviewTrackId;
    const previousBgmId = this.settingsPreviewPreviousBgmId;
    const previousWasPlaying = this.settingsPreviewPreviousWasPlaying;

    this.settingsPreviewTrackId = null;
    this.settingsPreviewPreviousBgmId = null;
    this.settingsPreviewPreviousWasPlaying = false;

    if (previewTrackId && previewTrackId !== previousBgmId) {
      this.pauseAudio(previewTrackId, 'settings preview closed');
    }

    this.currentBgmId = previousBgmId ?? null;
    if (!previousBgmId) return;

    if (previousWasPlaying && this.settings.musicEnabled && this.settings.musicVolume > 0 && !document.hidden) {
      this.playCurrentBgm('settings closed').catch(() => {});
      return;
    }

    this.pauseAudio(previousBgmId, 'settings closed');
  }

  playSettingsSound() {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return;

    clearTimeout(this.settingsSoundPreviewTimer);
    const audio = this.audioElements.get('nodeReach');
    if (!audio) return;

    audio.currentTime = 0;
    this.updateVolumes();
    this.playAudioElement('nodeReach', 'settings sound preview').catch(() => {});
    this.settingsSoundPreviewTimer = setTimeout(() => {
      this.pauseAudio('nodeReach', 'settings sound preview complete');
      audio.currentTime = 0;
    }, 900);
  }

  startMovement() {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return;

    const audio = this.audioElements.get('running');
    if (!audio || !audio.paused) return;

    this.updateVolumes();
    this.playAudioElement('running', 'movement start').catch(() => {});
  }

  stopMovement() {
    this.pauseAudio('running', 'movement stopped');
  }

  cancelMatchCues(reason = 'match exited') {
    this.eliminationCueUntil = 0;
    this.specialCueDepth = 0;
    this.interruptedBgmId = null;

    for (const id of ['running', 'nodeReach', 'roundEnd', 'elimination']) {
      const audio = this.audioElements.get(id);
      if (!audio) continue;
      if (!audio.paused) {
        console.info(`[Audio] Stopping ${this.getFileName(id)} (${reason})`);
        audio.pause();
      }
      audio.currentTime = 0;
    }
  }

  playNodeReach() {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return;

    this.updateVolumes();
    this.playAudioElement('nodeReach', 'node reached').catch(() => {});
  }

  playEffect(type) {
    if (type === 'NODE_CLAIM') {
      this.playNodeReach();
    }
    if (type === 'ARENA_SHRINK') {
      if (Date.now() < this.eliminationCueUntil) return;
      this.playRoundEndCue();
      return;
    }

    if (type === 'ELIMINATION') {
      this.playEliminationCue();
      return;
    }
  }

  playRoundEndCue() {
    if (!this.settings.musicEnabled || this.settings.musicVolume <= 0) return;
    this.playInterruptingCue('roundEnd', 'round ended').catch(() => {});
  }

  playEliminationCue() {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return;
    this.eliminationCueUntil = Date.now() + 6000;
    this.playInterruptingCue('elimination', 'player eliminated').catch(() => {});
  }

  async playInterruptingCue(id, reason) {
    const audio = this.audioElements.get(id);
    if (!audio) return;
    audio.currentTime = 0;

    const bgmAudio = this.currentBgmId ? this.audioElements.get(this.currentBgmId) : null;
    const shouldResumeBgm = Boolean(
      bgmAudio && !bgmAudio.paused && !document.hidden && this.settings.musicEnabled && this.settings.musicVolume > 0,
    );

    if (shouldResumeBgm && this.specialCueDepth === 0) {
      this.interruptedBgmId = this.currentBgmId;
      console.info(`[Audio] Freezing ${this.getFileName(this.interruptedBgmId)} for ${this.getFileName(id)} (${reason})`);
      bgmAudio.pause();
    }

    this.specialCueDepth += 1;
    const finalize = () => {
      this.specialCueDepth = Math.max(0, this.specialCueDepth - 1);
      if (this.specialCueDepth > 0) return;

      const resumeId = this.interruptedBgmId;
      this.interruptedBgmId = null;
      if (!resumeId) return;

      if (this.settings.musicEnabled && this.settings.musicVolume > 0 && !document.hidden) {
        console.info(`[Audio] Resuming ${this.getFileName(resumeId)} after ${this.getFileName(id)}`);
        this.playCurrentBgm('special cue complete').catch(() => {});
      }
    };

    return new Promise((resolve) => {
      audio.addEventListener('ended', () => {
        finalize();
        resolve();
      }, { once: true });

      audio.addEventListener('error', () => {
        finalize();
        resolve();
      }, { once: true });

      this.playAudioElement(id, reason).then((started) => {
        if (!started) {
          finalize();
          resolve();
        }
      });
    });
  }
  pauseAll(reason) {
    if (reason === 'tab hidden') {
      this.specialCueDepth = 0;
      this.interruptedBgmId = null;
    }

    for (const [id, audio] of this.audioElements) {
      if (!audio.paused) {
        console.info(`[Audio] Stopping ${this.getFileName(id)} (${reason})`);
        audio.pause();
      }
    }
  }

  pauseCurrentMusic(reason) {
    if (!this.currentBgmId) return;
    this.pauseAudio(this.currentBgmId, reason);
  }

  pauseAudio(id, reason) {
    const audio = this.audioElements.get(id);
    if (!audio || audio.paused) return;
    console.info(`[Audio] Stopping ${this.getFileName(id)} (${reason})`);
    audio.pause();
  }

  async playAudioElement(id, reason) {
    const audio = this.audioElements.get(id);
    if (!audio) return;

    this.updateVolumes();
    console.info(`[Audio] Playing ${this.getFileName(id)}${reason ? ` (${reason})` : ''}`);

    try {
      await audio.play();
      return true;
    } catch (error) {
      const message = error?.message || String(error);
      console.error(`[Audio] Failed to play ${this.getFileName(id)}: ${message}`);
      return false;
    }
  }

  createAudioElement(id, asset) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = asset.loop;
    audio.volume = asset.kind === 'music'
      ? (this.settings.musicVolume / 100) * asset.volumeScale
      : (this.settings.soundVolume / 100) * asset.volumeScale;
    audio.src = encodeURI(asset.src);

    console.info(`[Audio] Loading ${this.getFileName(id)}...`);

    audio.addEventListener('canplaythrough', () => {
      console.info(`[Audio] Loaded successfully: ${this.getFileName(id)}`);
    }, { once: true });

    audio.addEventListener('loadeddata', () => {
      console.info(`[Audio] Loaded successfully: ${this.getFileName(id)}`);
    }, { once: true });

    audio.addEventListener('play', () => {
      console.info(`[Audio] Playing ${this.getFileName(id)}`);
    });

    audio.addEventListener('pause', () => {
      if (!audio.ended) {
        console.info(`[Audio] Stopping ${this.getFileName(id)}`);
      }
    });

    audio.addEventListener('error', () => {
      console.error(`[Audio] Failed to load ${this.getFileName(id)}: ${this.describeMediaError(audio.error)}`);
    });

    audio.addEventListener('ended', () => {
      if (id === 'gameStart' && this.currentBgmId === 'gameStart') {
        this.playBGM('gameplay', false);
      }
    });

    audio.load();
    return audio;
  }

  async resumeAudioContext(reason) {
    if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Context();
    }

    if (!this.audioContext || this.audioContext.state !== 'suspended') return;

    console.info(`[Audio] Resuming AudioContext (${reason})`);
    try {
      await this.audioContext.resume();
      console.info('[Audio] AudioContext resumed');
    } catch (error) {
      console.error(`[Audio] Failed to resume AudioContext: ${error?.message || String(error)}`);
    }
  }

  isLobbyTrack(trackId) {
    return this.trackOrder.includes(trackId);
  }

  getFileName(id) {
    return this.assets[id]?.src.split('/').pop() || id;
  }

  getFileNameByAudio(audio) {
    const entry = [...this.audioElements.entries()].find(([, element]) => element === audio);
    return entry ? this.getFileName(entry[0]) : 'unknown audio';
  }

  describeMediaError(error) {
    if (!error) return 'unknown media error';
    const codeMap = {
      1: 'MEDIA_ERR_ABORTED',
      2: 'MEDIA_ERR_NETWORK',
      3: 'MEDIA_ERR_DECODE',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
    };
    return `${codeMap[error.code] || 'MEDIA_ERR_UNKNOWN'}${error.message ? ` - ${error.message}` : ''}`;
  }
}
