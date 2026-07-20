import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioManager } from '../public/js/AudioManager.js';

test('leaving a match cancels the elimination cue and other match sounds', () => {
  const manager = Object.create(AudioManager.prototype);
  const pausedIds = [];
  const ids = ['running', 'nodeReach', 'roundEnd', 'elimination'];

  manager.eliminationCueUntil = Date.now() + 6000;
  manager.specialCueDepth = 2;
  manager.interruptedBgmId = 'gameplay';
  manager.assets = Object.fromEntries(
    ids.map((id) => [id, { src: `/music/${id}.mp3` }]),
  );
  manager.audioElements = new Map(ids.map((id) => [id, {
    paused: false,
    currentTime: 12,
    pause() {
      this.paused = true;
      pausedIds.push(id);
    },
  }]));

  manager.cancelMatchCues('test exit');

  assert.equal(manager.eliminationCueUntil, 0);
  assert.equal(manager.specialCueDepth, 0);
  assert.equal(manager.interruptedBgmId, null);
  assert.deepEqual(pausedIds, ids);
  for (const audio of manager.audioElements.values()) {
    assert.equal(audio.currentTime, 0);
  }
});
