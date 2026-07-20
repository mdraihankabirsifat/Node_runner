'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  OFFLINE_FILE,
  PRODUCTION_GAME_URL,
  getConfiguredGameUrl,
  isAllowedGameNavigation,
  isAllowedOfflineNavigation,
  isSafeBrowserOpenUrl,
  isSafeExternalUrl,
} = require('./main.cjs');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildConfig = require(path.join(root, 'electron-builder.config.cjs'));

assert.equal(getConfiguredGameUrl({}), PRODUCTION_GAME_URL);
assert.equal(
  getConfiguredGameUrl({ NODE_RUNNER_GAME_URL: 'http://localhost:3000' }),
  'http://localhost:3000',
);
assert.throws(
  () => getConfiguredGameUrl({ NODE_RUNNER_GAME_URL: 'https://YOUR_ACTUAL_RENDER_URL.onrender.com' }),
  /placeholder/i,
);
assert.throws(
  () => getConfiguredGameUrl({ NODE_RUNNER_GAME_URL: 'http://example.com' }),
  /not allowed/i,
);
assert.throws(
  () => getConfiguredGameUrl({ NODE_RUNNER_GAME_URL: 'https://user:secret@node-runner-xayv.onrender.com' }),
  /credentials/i,
);
assert.equal(isAllowedGameNavigation(`${PRODUCTION_GAME_URL}/socket.io/`, PRODUCTION_GAME_URL), true);
assert.equal(isAllowedGameNavigation('https://example.com/', PRODUCTION_GAME_URL), false);
assert.equal(isAllowedOfflineNavigation(pathToFileURL(OFFLINE_FILE).href), true);
assert.equal(isSafeExternalUrl('https://github.com/mdraihankabirsifat/Node_runner', PRODUCTION_GAME_URL), true);
assert.equal(isSafeExternalUrl('javascript:alert(1)', PRODUCTION_GAME_URL), false);
assert.equal(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe', PRODUCTION_GAME_URL), false);
assert.equal(isSafeBrowserOpenUrl(PRODUCTION_GAME_URL, PRODUCTION_GAME_URL), true);
assert.equal(isSafeBrowserOpenUrl('javascript:alert(1)', PRODUCTION_GAME_URL), false);

for (const filename of ['main.cjs', 'offline.html', 'offline.css', 'offline.js']) {
  assert.equal(fs.existsSync(path.join(__dirname, filename)), true, `Missing desktop/${filename}`);
}
assert.equal(packageJson.main, 'desktop/main.cjs');
assert.equal(buildConfig.asar, true);
assert.equal(buildConfig.directories.output, '../dist');
assert.deepEqual(
  buildConfig.win.target.map((target) => target.target),
  ['portable', 'zip'],
);
assert.equal(buildConfig.files.includes('!validate.cjs'), true);
assert.equal(packageJson.scripts['build:win'].includes('--projectDir desktop'), true);
const desktopPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
assert.deepEqual(desktopPackage.dependencies, undefined);
assert.equal(desktopPackage.main, 'main.cjs');

console.log(`Desktop validation passed for ${PRODUCTION_GAME_URL}.`);
