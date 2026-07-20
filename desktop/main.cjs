'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { fileURLToPath, pathToFileURL } = require('node:url');

const PRODUCT_NAME = 'Node Runner';
const PRODUCTION_GAME_URL = 'https://node-runner-xayv.onrender.com';
const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PLACEHOLDER_PATTERN = /YOUR[_-](?:ACTUAL[_-])?RENDER|YOUR-RENDER-SERVICE-NAME/i;
const OFFLINE_FILE = path.join(__dirname, 'offline.html');

function getConfiguredGameUrl(environment = process.env) {
  const configured = String(environment.NODE_RUNNER_GAME_URL || PRODUCTION_GAME_URL).trim();
  if (!configured || PLACEHOLDER_PATTERN.test(configured)) {
    throw new Error(
      'The desktop game URL is missing or still contains a placeholder. '
      + 'Set NODE_RUNNER_GAME_URL for local development or configure the verified Render URL.',
    );
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`The configured game URL is invalid: ${configured}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('The configured game URL must not contain credentials.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('The configured game URL must be an origin without a path, query, or fragment.');
  }

  const productionOrigin = new URL(PRODUCTION_GAME_URL).origin;
  const isLocalDevelopment = parsed.protocol === 'http:'
    && LOCAL_DEVELOPMENT_HOSTS.has(parsed.hostname);
  const isProduction = parsed.protocol === 'https:' && parsed.origin === productionOrigin;
  if (!isLocalDevelopment && !isProduction) {
    throw new Error(
      `The configured game origin is not allowed: ${parsed.origin}. `
      + `Use ${productionOrigin} or an http://localhost development URL.`,
    );
  }

  return parsed.origin;
}

function isAllowedGameNavigation(targetUrl, gameOrigin) {
  try {
    const parsed = new URL(targetUrl);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && parsed.origin === gameOrigin;
  } catch {
    return false;
  }
}

function isAllowedOfflineNavigation(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'file:'
      && path.resolve(fileURLToPath(parsed)) === path.resolve(OFFLINE_FILE);
  } catch {
    return false;
  }
}

function isSafeExternalUrl(targetUrl, gameOrigin) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && parsed.origin !== gameOrigin;
  } catch {
    return false;
  }
}

function isSafeBrowserOpenUrl(targetUrl, gameOrigin) {
  return isAllowedGameNavigation(targetUrl, gameOrigin)
    || isSafeExternalUrl(targetUrl, gameOrigin);
}

function startElectron() {
  const {
    app,
    BrowserWindow,
    dialog,
    session,
    shell,
  } = require('electron');

  let gameOrigin;
  try {
    gameOrigin = getConfiguredGameUrl();
  } catch (error) {
    app.whenReady().then(() => {
      console.error('[desktop] Invalid game URL:', error.message);
      dialog.showErrorBox(`${PRODUCT_NAME} startup error`, error.message);
      app.quit();
    });
    return;
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.setName(PRODUCT_NAME);
  app.setAppUserModelId('com.nodeRunner.game');

  let mainWindow = null;
  let loadingOffline = false;
  let smokeFinished = false;
  const smokeArgumentPrefix = '--node-runner-smoke-result=';
  const smokeArgument = process.argv.find((argument) => argument.startsWith(smokeArgumentPrefix));
  const smokeResultPath = smokeArgument
    ? smokeArgument.slice(smokeArgumentPrefix.length)
    : process.env.NODE_RUNNER_DESKTOP_SMOKE_RESULT;
  const smokeMode = process.env.NODE_RUNNER_DESKTOP_SMOKE === '1' || Boolean(smokeArgument);

  const finishSmoke = (passed, details) => {
    if (!smokeMode || smokeFinished) return;
    smokeFinished = true;
    const result = { passed, ...details };
    console.log(`[desktop-smoke] ${JSON.stringify(result)}`);
    if (smokeResultPath) {
      try {
        fs.writeFileSync(smokeResultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      } catch (error) {
        console.error('[desktop-smoke] Could not write result:', error.message);
      }
    }
    app.exit(passed ? 0 : 1);
  };

  if (smokeMode) {
    setTimeout(() => {
      finishSmoke(false, {
        error: 'Desktop smoke check timed out after 30 seconds.',
        currentUrl: mainWindow?.webContents.getURL() || '',
      });
    }, 30000);
  }

  const openExternalSafely = async (targetUrl) => {
    if (!isSafeBrowserOpenUrl(targetUrl, gameOrigin)) {
      console.warn('[desktop] Blocked unsafe external URL:', targetUrl);
      return;
    }
    try {
      await shell.openExternal(targetUrl);
    } catch (error) {
      console.error('[desktop] Could not open external URL:', error.message);
    }
  };

  const createOfflineUrl = () => {
    const offlineUrl = new URL(pathToFileURL(OFFLINE_FILE).href);
    offlineUrl.searchParams.set('gameUrl', gameOrigin);
    return offlineUrl.href;
  };

  const showOffline = async (reason) => {
    if (!mainWindow || mainWindow.isDestroyed() || loadingOffline) return;
    loadingOffline = true;
    console.error('[desktop] Game load failed:', reason);
    try {
      await mainWindow.loadURL(createOfflineUrl());
    } catch (error) {
      console.error('[desktop] Offline screen failed to load:', error.message);
    } finally {
      loadingOffline = false;
    }
  };

  const loadGame = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      await mainWindow.loadURL(gameOrigin);
    } catch (error) {
      await showOffline(error.message);
    }
  };

  const guardNavigation = (event, targetUrl) => {
    if (
      isAllowedGameNavigation(targetUrl, gameOrigin)
      || isAllowedOfflineNavigation(targetUrl)
    ) return;
    event.preventDefault();
    void openExternalSafely(targetUrl);
  };

  const runSmokeCheck = async () => {
    if (!smokeMode || smokeFinished) return;
    try {
      const result = await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
        const startedAt = Date.now();
        const inspect = () => {
          const connectionState = document.querySelector('#connection-pill')?.className || '';
          if (connectionState.includes('online') || Date.now() - startedAt >= 15000) {
            resolve({
              origin: window.location.origin,
              nodeRequire: typeof window.require,
              nodeProcess: typeof window.process,
              socketIo: typeof window.io,
              hasCanvas: Boolean(document.querySelector('#game-canvas')),
              connectionState
            });
          } else {
            window.setTimeout(inspect, 250);
          }
        };
        inspect();
      })`);
      const passed = result.origin === gameOrigin
        && result.nodeRequire === 'undefined'
        && result.nodeProcess === 'undefined'
        && result.socketIo === 'function'
        && result.hasCanvas
        && result.connectionState.includes('online');
      finishSmoke(passed, result);
    } catch (error) {
      finishSmoke(false, { error: error.message });
    }
  };

  const createWindow = () => {
    mainWindow = new BrowserWindow({
      title: PRODUCT_NAME,
      width: 1280,
      height: 720,
      minWidth: 960,
      minHeight: 540,
      center: true,
      resizable: true,
      autoHideMenuBar: true,
      backgroundColor: '#07101f',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
        spellcheck: false,
      },
    });
    mainWindow.setMenuBarVisibility(false);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void openExternalSafely(url);
      return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', guardNavigation);
    mainWindow.webContents.on('will-redirect', guardNavigation);
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === -3 || isAllowedOfflineNavigation(validatedUrl)) return;
        if (smokeMode) {
          finishSmoke(false, {
            error: errorDescription,
            errorCode,
            validatedUrl,
          });
          return;
        }
        void showOffline(`${errorDescription} (${errorCode}) while loading ${validatedUrl}`);
      },
    );
    mainWindow.webContents.on('did-finish-load', () => {
      const currentUrl = mainWindow.webContents.getURL();
      if (isAllowedGameNavigation(currentUrl, gameOrigin)) void runSmokeCheck();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (key === 'f11' || (input.alt && key === 'enter')) {
        event.preventDefault();
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        return;
      }
      if (key === 'escape' && mainWindow.isFullScreen()) {
        event.preventDefault();
        mainWindow.setFullScreen(false);
        return;
      }
      if (input.control && !input.alt && key === 'r') {
        event.preventDefault();
        if (isAllowedGameNavigation(mainWindow.webContents.getURL(), gameOrigin)) {
          mainWindow.webContents.reload();
        } else {
          void loadGame();
        }
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    void loadGame();
  };

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.whenReady()
    .then(() => {
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      createWindow();
    })
    .catch((error) => {
      console.error('[desktop] Electron startup failed:', error);
      if (smokeMode) finishSmoke(false, { error: error.message, stack: error.stack });
      else app.quit();
    });
  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

module.exports = {
  OFFLINE_FILE,
  PRODUCT_NAME,
  PRODUCTION_GAME_URL,
  getConfiguredGameUrl,
  isAllowedGameNavigation,
  isAllowedOfflineNavigation,
  isSafeBrowserOpenUrl,
  isSafeExternalUrl,
};

if (process.versions.electron && process.type === 'browser') startElectron();
