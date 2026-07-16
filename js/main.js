import { CONFIG } from './config.js';
import { Game } from './systems/Game.js';
import { formatSeconds } from './utils.js';

const elements = {
  menuScreen: document.querySelector('#menuScreen'),
  gameScreen: document.querySelector('#gameScreen'),
  playerCountOutput: document.querySelector('#playerCountOutput'),
  nodeCountLabel: document.querySelector('#nodeCountLabel'),
  decreasePlayers: document.querySelector('#decreasePlayers'),
  increasePlayers: document.querySelector('#increasePlayers'),
  arenaOptions: [...document.querySelectorAll('.arena-option')],
  startGameButton: document.querySelector('#startGameButton'),
  howToButton: document.querySelector('#howToButton'),
  soundButton: document.querySelector('#soundButton'),
  modalBackdrop: document.querySelector('#modalBackdrop'),
  closeModalButton: document.querySelector('#closeModalButton'),
  toast: document.querySelector('#toast'),
  lockedModeCards: [...document.querySelectorAll('.mode-card.is-locked')],
  canvas: document.querySelector('#gameCanvas'),
  backToMenuButton: document.querySelector('#backToMenuButton'),
  pauseButton: document.querySelector('#pauseButton'),
  resumeButton: document.querySelector('#resumeButton'),
  quitButton: document.querySelector('#quitButton'),
  pauseOverlay: document.querySelector('#pauseOverlay'),
  countdownOverlay: document.querySelector('#countdownOverlay'),
  eventFeed: document.querySelector('#eventFeed'),
  arenaLabel: document.querySelector('#arenaLabel'),
  phaseLabel: document.querySelector('#phaseLabel'),
  aliveLabel: document.querySelector('#aliveLabel'),
  zoneLabel: document.querySelector('#zoneLabel'),
  heartValue: document.querySelector('#heartValue'),
  heartBar: document.querySelector('#heartBar'),
  exposureValue: document.querySelector('#exposureValue'),
  exposureBar: document.querySelector('#exposureBar'),
  statusHint: document.querySelector('#statusHint'),
  gameOverOverlay: document.querySelector('#gameOverOverlay'),
  gameOverTitle: document.querySelector('#gameOverTitle'),
  gameOverText: document.querySelector('#gameOverText'),
  scoreSummary: document.querySelector('#scoreSummary'),
  playAgainButton: document.querySelector('#playAgainButton'),
  gameOverMenuButton: document.querySelector('#gameOverMenuButton'),
};

const state = {
  playerCount: 4,
  arenaType: 'polygon',
  soundEnabled: true,
};

const game = new Game(elements.canvas, elements);

game.onGameOver = ({ winner, human, matchElapsed }) => {
  const won = winner?.isHuman;
  elements.gameOverTitle.textContent = won ? 'VICTORY' : 'FLATLINED';
  elements.gameOverText.textContent = won
    ? 'You conquered the final opening.'
    : winner ? `${winner.name} survived the last rotation.` : 'No runner survived.';
  elements.scoreSummary.innerHTML = `
    <div><b>${formatSeconds(matchElapsed)}</b><small>MATCH TIME</small></div>
    <div><b>${human?.nodesClaimed ?? 0}</b><small>NODES CLAIMED</small></div>
    <div><b>${human ? Math.round(human.distanceTravelled / 10) : 0}</b><small>DISTANCE</small></div>
  `;
  elements.gameOverOverlay.hidden = false;
};

function updatePlayerCount(delta) {
  state.playerCount = Math.max(CONFIG.GAME.minPlayers, Math.min(CONFIG.GAME.maxPlayers, state.playerCount + delta));
  elements.playerCountOutput.value = state.playerCount;
  elements.playerCountOutput.textContent = state.playerCount;
  elements.nodeCountLabel.textContent = `${state.playerCount - 1} nodes + 1 runner`;
}

function selectArena(type) {
  state.arenaType = type;
  for (const button of elements.arenaOptions) {
    const selected = button.dataset.arena === type;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
}

function showScreen(name) {
  const gameVisible = name === 'game';
  elements.menuScreen.classList.toggle('is-active', !gameVisible);
  elements.gameScreen.classList.toggle('is-active', gameVisible);
  document.querySelector('.topbar').style.display = gameVisible ? 'none' : 'flex';
  elements.gameScreen.style.inset = gameVisible ? '0' : '';
}

function startGame() {
  elements.gameOverOverlay.hidden = true;
  elements.pauseOverlay.hidden = true;
  showScreen('game');
  requestAnimationFrame(() => {
    game.setSoundEnabled(state.soundEnabled);
    game.start({ playerCount: state.playerCount, arenaType: state.arenaType });
  });
}

function returnToMenu() {
  game.stopLoop();
  elements.pauseOverlay.hidden = true;
  elements.gameOverOverlay.hidden = true;
  showScreen('menu');
}

let toastTimer = null;
function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

elements.decreasePlayers.addEventListener('click', () => updatePlayerCount(-1));
elements.increasePlayers.addEventListener('click', () => updatePlayerCount(1));
elements.arenaOptions.forEach((button) => button.addEventListener('click', () => selectArena(button.dataset.arena)));
elements.startGameButton.addEventListener('click', startGame);
elements.playAgainButton.addEventListener('click', startGame);
elements.backToMenuButton.addEventListener('click', returnToMenu);
elements.quitButton.addEventListener('click', returnToMenu);
elements.gameOverMenuButton.addEventListener('click', returnToMenu);
elements.pauseButton.addEventListener('click', () => game.pause());
elements.resumeButton.addEventListener('click', () => game.resume());

elements.howToButton.addEventListener('click', () => { elements.modalBackdrop.hidden = false; });
elements.closeModalButton.addEventListener('click', () => { elements.modalBackdrop.hidden = true; });
elements.modalBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.modalBackdrop) elements.modalBackdrop.hidden = true;
});

elements.soundButton.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  elements.soundButton.textContent = state.soundEnabled ? '♫' : '×';
  elements.soundButton.setAttribute('aria-label', state.soundEnabled ? 'Mute sound' : 'Enable sound');
  game.setSoundEnabled(state.soundEnabled);
  toast(state.soundEnabled ? 'Sound enabled' : 'Sound muted');
});

elements.lockedModeCards.forEach((button) => {
  button.addEventListener('click', () => toast(button.dataset.comingSoon));
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && elements.menuScreen.classList.contains('is-active') && elements.modalBackdrop.hidden) {
    event.preventDefault();
    startGame();
  }
  if (event.key === 'Escape' && !elements.modalBackdrop.hidden) elements.modalBackdrop.hidden = true;
});

window.addEventListener('resize', () => {
  if (elements.gameScreen.classList.contains('is-active')) game.resize();
});

updatePlayerCount(0);
selectArena('polygon');
