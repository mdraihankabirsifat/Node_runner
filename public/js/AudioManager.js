const EFFECTS = Object.freeze({
  click: [{ frequency: 360, duration: 0.045, type: 'sine', volume: 0.12 }],
  MATCH_START: [{ frequency: 440, duration: 0.12 }, { frequency: 660, delay: 0.1, duration: 0.16 }],
  NODE_CLAIM: [{ frequency: 520, duration: 0.08 }, { frequency: 780, delay: 0.06, duration: 0.13 }],
  ELIMINATION: [{ frequency: 180, duration: 0.2, type: 'sawtooth' }, { frequency: 110, delay: 0.12, duration: 0.25 }],
  ROUND_START: [{ frequency: 330, duration: 0.08 }, { frequency: 495, delay: 0.07, duration: 0.12 }],
  GAME_OVER: [{ frequency: 392, duration: 0.16 }, { frequency: 523, delay: 0.13, duration: 0.2 }, { frequency: 659, delay: 0.27, duration: 0.35 }],
  achievement: [{ frequency: 523, duration: 0.1 }, { frequency: 659, delay: 0.1, duration: 0.12 }, { frequency: 784, delay: 0.21, duration: 0.28 }],
});

export class AudioManager {
  constructor(settings) {
    this.settings = { ...settings };
    this.context = null;
    this.musicTimer = null;
    this.musicStep = 0;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopMusic();
      else this.startMusic();
    });
  }

  async unlock() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
    this.startMusic();
  }

  applySettings(settings) {
    this.settings = { ...settings };
    if (this.settings.musicEnabled && this.settings.musicVolume > 0) this.startMusic();
    else this.stopMusic();
  }

  playTone({ frequency, delay = 0, duration = 0.12, type = 'sine', volume = 0.2 }, channelVolume) {
    if (!this.context || this.context.state !== 'running') return;
    const startAt = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * channelVolume), startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  playEffect(type) {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return;
    const tones = EFFECTS[type];
    if (!tones) return;
    const channelVolume = this.settings.soundVolume / 100;
    for (const tone of tones) this.playTone(tone, channelVolume);
  }

  playMusicNote() {
    if (!this.settings.musicEnabled || document.hidden) return;
    const notes = [220, 261.63, 329.63, 293.66, 392, 329.63, 261.63, 196];
    const frequency = notes[this.musicStep % notes.length];
    this.musicStep += 1;
    const channelVolume = (this.settings.musicVolume / 100) * 0.18;
    this.playTone({ frequency, duration: 0.75, type: 'sine', volume: 0.16 }, channelVolume);
    this.playTone({ frequency: frequency / 2, duration: 0.85, type: 'triangle', volume: 0.08 }, channelVolume);
  }

  startMusic() {
    if (
      this.musicTimer
      || !this.context
      || this.context.state !== 'running'
      || !this.settings.musicEnabled
      || this.settings.musicVolume <= 0
      || document.hidden
    ) return;
    this.playMusicNote();
    this.musicTimer = window.setInterval(() => this.playMusicNote(), 820);
  }

  stopMusic() {
    if (!this.musicTimer) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
