'use strict';

const hostnameElement = document.querySelector('#server-hostname');
const errorElement = document.querySelector('#offline-error');
const retryButton = document.querySelector('#retry-button');
const browserButton = document.querySelector('#browser-button');

function readGameUrl() {
  const configured = new URLSearchParams(window.location.search).get('gameUrl');
  if (!configured) throw new Error('The game server URL is missing.');
  const parsed = new URL(configured);
  const isRender = parsed.protocol === 'https:' && parsed.hostname === 'node-runner-xayv.onrender.com';
  const isLocal = parsed.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((!isRender && !isLocal) || parsed.username || parsed.password) {
    throw new Error('The configured game server is not allowed.');
  }
  return parsed;
}

let gameUrl = null;
try {
  gameUrl = readGameUrl();
  hostnameElement.textContent = gameUrl.host;
} catch (error) {
  hostnameElement.textContent = 'Invalid configuration';
  errorElement.textContent = error.message;
  errorElement.hidden = false;
  retryButton.disabled = true;
  browserButton.disabled = true;
}

retryButton.addEventListener('click', () => {
  if (gameUrl) window.location.assign(gameUrl.href);
});

browserButton.addEventListener('click', () => {
  if (gameUrl) window.open(gameUrl.href, '_blank', 'noopener,noreferrer');
});
