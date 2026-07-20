import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerPreferences } from '../public/js/PlayerPreferences.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test('audio settings persist independently in browser storage', () => {
  const storage = new MemoryStorage();
  const preferences = new PlayerPreferences(storage);
  preferences.updateSettings({
    musicEnabled: false,
    musicVolume: 10,
    soundEnabled: true,
    soundVolume: 45,
  });

  assert.deepEqual(new PlayerPreferences(storage).getSettings(), {
    musicEnabled: false,
    musicVolume: 10,
    soundEnabled: true,
    soundVolume: 45,
  });
});

test('match records, high scores, and achievements persist without duplicate matches', () => {
  const storage = new MemoryStorage();
  const preferences = new PlayerPreferences(storage);
  const firstResult = preferences.recordMatch('ROOM-1', {
    won: true,
    distanceCovered: 1250,
    playingTime: 72,
    efficiency: 92,
  });

  assert.equal(firstResult.recorded, true);
  assert.deepEqual(
    firstResult.unlocked.map((achievement) => achievement.id),
    ['first-match', 'first-win', 'distance-1000', 'endurance-60', 'efficient-90'],
  );

  const duplicate = preferences.recordMatch('ROOM-1', {
    won: true,
    distanceCovered: 9999,
  });
  assert.equal(duplicate.recorded, false);

  const restored = new PlayerPreferences(storage).getProfile();
  assert.equal(restored.matchesPlayed, 1);
  assert.equal(restored.wins, 1);
  assert.equal(restored.bestDistance, 1250);
  assert.equal(restored.bestPlayingTime, 72);
  assert.equal(restored.bestEfficiency, 92);
});

test('progress can be reset without changing audio preferences', () => {
  const storage = new MemoryStorage();
  const preferences = new PlayerPreferences(storage);
  preferences.updateSettings({ musicVolume: 5 });
  preferences.recordMatch('ROOM-1', { distanceCovered: 100 });
  const profile = preferences.resetProfile();

  assert.equal(profile.matchesPlayed, 0);
  assert.deepEqual(profile.achievements, []);
  assert.equal(preferences.getSettings().musicVolume, 5);
});
