export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-match', icon: '◆', title: 'Circuit Initiate', description: 'Complete your first match.' },
  { id: 'first-win', icon: '♛', title: 'Last Runner', description: 'Win your first match.' },
  { id: 'distance-1000', icon: '⇝', title: 'Road Runner', description: 'Cover 1,000 px in one match.' },
  { id: 'endurance-60', icon: '⏱', title: 'Endurance', description: 'Survive for at least 60 seconds.' },
  { id: 'efficient-90', icon: '⚡', title: 'Almost Untouchable', description: 'Finish with 90% efficiency.' },
  { id: 'veteran-10', icon: '★', title: 'Circuit Veteran', description: 'Complete 10 matches.' },
]);

const SETTINGS_KEY = 'node-runner:settings:v1';
const PROFILE_KEY = 'node-runner:profile:v1';

const DEFAULT_SETTINGS = Object.freeze({
  musicEnabled: true,
  musicVolume: 25,
  soundEnabled: true,
  soundVolume: 70,
});

const DEFAULT_PROFILE = Object.freeze({
  matchesPlayed: 0,
  wins: 0,
  bestDistance: 0,
  bestPlayingTime: 0,
  bestEfficiency: 0,
  achievements: [],
  recordedMatchIds: [],
});

function clampVolume(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function copyProfile(profile) {
  return {
    ...profile,
    achievements: [...profile.achievements],
    recordedMatchIds: [...profile.recordedMatchIds],
  };
}

export class PlayerPreferences {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.settings = this.readSettings();
    this.profile = this.readProfile();
  }

  read(key) {
    try {
      return JSON.parse(this.storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private or locked-down browser sessions.
    }
  }

  readSettings() {
    const saved = this.read(SETTINGS_KEY) ?? {};
    return {
      musicEnabled: saved.musicEnabled !== false,
      musicVolume: clampVolume(saved.musicVolume, DEFAULT_SETTINGS.musicVolume),
      soundEnabled: saved.soundEnabled !== false,
      soundVolume: clampVolume(saved.soundVolume, DEFAULT_SETTINGS.soundVolume),
    };
  }

  readProfile() {
    const saved = this.read(PROFILE_KEY) ?? {};
    return {
      matchesPlayed: Math.max(0, Number(saved.matchesPlayed) || 0),
      wins: Math.max(0, Number(saved.wins) || 0),
      bestDistance: Math.max(0, Number(saved.bestDistance) || 0),
      bestPlayingTime: Math.max(0, Number(saved.bestPlayingTime) || 0),
      bestEfficiency: Math.max(0, Number(saved.bestEfficiency) || 0),
      achievements: Array.isArray(saved.achievements)
        ? saved.achievements.filter((id) => ACHIEVEMENTS.some((item) => item.id === id))
        : [],
      recordedMatchIds: Array.isArray(saved.recordedMatchIds)
        ? saved.recordedMatchIds.filter((id) => typeof id === 'string').slice(-20)
        : [],
    };
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch = {}) {
    this.settings = {
      musicEnabled: patch.musicEnabled ?? this.settings.musicEnabled,
      musicVolume: clampVolume(patch.musicVolume, this.settings.musicVolume),
      soundEnabled: patch.soundEnabled ?? this.settings.soundEnabled,
      soundVolume: clampVolume(patch.soundVolume, this.settings.soundVolume),
    };
    this.write(SETTINGS_KEY, this.settings);
    return this.getSettings();
  }

  getProfile() {
    return copyProfile(this.profile);
  }

  recordMatch(matchId, result = {}) {
    if (!matchId || this.profile.recordedMatchIds.includes(matchId)) {
      return { profile: this.getProfile(), unlocked: [], recorded: false };
    }

    this.profile.matchesPlayed += 1;
    if (result.won) this.profile.wins += 1;
    this.profile.bestDistance = Math.max(this.profile.bestDistance, Number(result.distanceCovered) || 0);
    this.profile.bestPlayingTime = Math.max(this.profile.bestPlayingTime, Number(result.playingTime) || 0);
    this.profile.bestEfficiency = Math.max(this.profile.bestEfficiency, Number(result.efficiency) || 0);
    this.profile.recordedMatchIds = [...this.profile.recordedMatchIds, String(matchId)].slice(-20);

    const earnedIds = new Set(this.profile.achievements);
    const unlockWhen = {
      'first-match': this.profile.matchesPlayed >= 1,
      'first-win': this.profile.wins >= 1,
      'distance-1000': Number(result.distanceCovered) >= 1000,
      'endurance-60': Number(result.playingTime) >= 60,
      'efficient-90': Number(result.efficiency) >= 90,
      'veteran-10': this.profile.matchesPlayed >= 10,
    };
    const unlocked = ACHIEVEMENTS.filter((achievement) => {
      if (!unlockWhen[achievement.id] || earnedIds.has(achievement.id)) return false;
      earnedIds.add(achievement.id);
      return true;
    });
    this.profile.achievements = [...earnedIds];
    this.write(PROFILE_KEY, this.profile);
    return { profile: this.getProfile(), unlocked, recorded: true };
  }

  resetProfile() {
    this.profile = copyProfile(DEFAULT_PROFILE);
    this.write(PROFILE_KEY, this.profile);
    return this.getProfile();
  }
}
