function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class UI {
  constructor(actions) {
    this.actions = actions;
    this.playerCount = 6;
    this.arenaType = 'polygon';
    this.localId = null;
    this.currentRoom = null;
    this.toastTimer = null;
    this.eventItems = [];

    this.screens = {
      menu: document.querySelector('#menu-screen'),
      lobby: document.querySelector('#lobby-screen'),
      game: document.querySelector('#game-screen'),
    };

    this.elements = {
      connectionPill: document.querySelector('#connection-pill'),
      playerName: document.querySelector('#player-name'),
      playerCountValue: document.querySelector('#player-count-value'),
      countMinus: document.querySelector('#count-minus'),
      countPlus: document.querySelector('#count-plus'),
      arenaTabs: [...document.querySelectorAll('.arena-tab')],
      botsButton: document.querySelector('#bots-button'),
      hostButton: document.querySelector('#host-button'),
      joinButton: document.querySelector('#join-button'),
      joinPanel: document.querySelector('#join-panel'),
      roomCodeInput: document.querySelector('#room-code-input'),
      joinConfirmButton: document.querySelector('#join-confirm-button'),
      menuError: document.querySelector('#menu-error'),
      howButton: document.querySelector('#how-button'),
      howModal: document.querySelector('#how-modal'),
      howCloseButton: document.querySelector('#how-close-button'),

      lobbyBackButton: document.querySelector('#lobby-back-button'),
      copyCodeButton: document.querySelector('#copy-code-button'),
      lobbyStatusText: document.querySelector('#lobby-status-text'),
      lobbyTitle: document.querySelector('#lobby-title'),
      lobbyPlayerList: document.querySelector('#lobby-player-list'),
      hostBadge: document.querySelector('#host-badge'),
      hostSettings: document.querySelector('#host-settings'),
      lobbyPlayerCount: document.querySelector('#lobby-player-count'),
      lobbyArena: document.querySelector('#lobby-arena'),
      fillBotsToggle: document.querySelector('#fill-bots-toggle'),
      startGameButton: document.querySelector('#start-game-button'),
      lobbyWaitMessage: document.querySelector('#lobby-wait-message'),
      lobbyError: document.querySelector('#lobby-error'),

      gameRoomCode: document.querySelector('#game-room-code'),
      roundValue: document.querySelector('#round-value'),
      gameStateText: document.querySelector('#game-state-text'),
      stateDot: document.querySelector('#state-dot'),
      gameLeaveButton: document.querySelector('#game-leave-button'),
      centerMessage: document.querySelector('#center-message'),
      aliveCount: document.querySelector('#alive-count'),
      playerStatsList: document.querySelector('#player-stats-list'),
      eventFeed: document.querySelector('#event-feed'),
      gameoverOverlay: document.querySelector('#gameover-overlay'),
      winnerTitle: document.querySelector('#winner-title'),
      winnerSubtitle: document.querySelector('#winner-subtitle'),
      restartButton: document.querySelector('#restart-button'),
      restartWait: document.querySelector('#restart-wait'),
      toast: document.querySelector('#toast'),
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.countMinus.addEventListener('click', () => this.setPlayerCount(this.playerCount - 1));
    this.elements.countPlus.addEventListener('click', () => this.setPlayerCount(this.playerCount + 1));

    for (const tab of this.elements.arenaTabs) {
      tab.addEventListener('click', () => this.setArenaType(tab.dataset.arena));
    }

    this.elements.botsButton.addEventListener('click', () => this.actions.playBots(this.getSetup()));
    this.elements.hostButton.addEventListener('click', () => this.actions.hostGame(this.getSetup()));
    this.elements.joinButton.addEventListener('click', () => {
      this.elements.joinPanel.classList.toggle('hidden');
      if (!this.elements.joinPanel.classList.contains('hidden')) this.elements.roomCodeInput.focus();
    });
    this.elements.joinConfirmButton.addEventListener('click', () => {
      this.actions.joinGame({
        name: this.getPlayerName(),
        code: this.elements.roomCodeInput.value,
      });
    });
    this.elements.roomCodeInput.addEventListener('input', (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    this.elements.roomCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.elements.joinConfirmButton.click();
    });

    this.elements.howButton.addEventListener('click', () => this.elements.howModal.classList.remove('hidden'));
    this.elements.howCloseButton.addEventListener('click', () => this.elements.howModal.classList.add('hidden'));
    this.elements.howModal.addEventListener('click', (event) => {
      if (event.target === this.elements.howModal) this.elements.howModal.classList.add('hidden');
    });

    this.elements.lobbyBackButton.addEventListener('click', () => this.actions.leaveRoom());
    this.elements.gameLeaveButton.addEventListener('click', () => this.actions.leaveRoom());
    this.elements.copyCodeButton.addEventListener('click', async () => {
      const code = this.currentRoom?.code;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        this.showToast(`Room code ${code} copied.`);
      } catch {
        this.showToast(`Room code: ${code}`);
      }
    });

    const updateSettings = () => {
      this.actions.updateSettings({
        maxPlayers: Number(this.elements.lobbyPlayerCount.value),
        arenaType: this.elements.lobbyArena.value,
        fillBots: this.elements.fillBotsToggle.checked,
      });
    };
    this.elements.lobbyPlayerCount.addEventListener('change', updateSettings);
    this.elements.lobbyArena.addEventListener('change', updateSettings);
    this.elements.fillBotsToggle.addEventListener('change', updateSettings);
    this.elements.startGameButton.addEventListener('click', () => this.actions.startGame());
    this.elements.restartButton.addEventListener('click', () => this.actions.startGame());
  }

  showScreen(name) {
    for (const [screenName, element] of Object.entries(this.screens)) {
      element.classList.toggle('active', screenName === name);
    }
  }

  setPlayerCount(value) {
    this.playerCount = clamp(value, 4, 8);
    this.elements.playerCountValue.textContent = String(this.playerCount);
  }

  setArenaType(value) {
    this.arenaType = ['polygon', 'football', 'circle'].includes(value) ? value : 'polygon';
    for (const tab of this.elements.arenaTabs) {
      tab.classList.toggle('active', tab.dataset.arena === this.arenaType);
    }
  }

  getPlayerName() {
    const clean = this.elements.playerName.value.trim().slice(0, 16);
    return clean || 'Runner';
  }

  getSetup() {
    return {
      name: this.getPlayerName(),
      maxPlayers: this.playerCount,
      arenaType: this.arenaType,
      fillBots: true,
    };
  }

  setConnectionState(state) {
    const pill = this.elements.connectionPill;
    pill.className = `connection-pill ${state}`;
    pill.textContent = state === 'online' ? '● Online' : state === 'offline' ? 'Offline' : 'Connecting…';
  }

  setBusy(busy) {
    this.elements.botsButton.disabled = busy;
    this.elements.hostButton.disabled = busy;
    this.elements.joinConfirmButton.disabled = busy;
  }

  showMenuError(message = '') {
    this.elements.menuError.textContent = message;
    this.elements.menuError.classList.toggle('hidden', !message);
  }

  showLobbyError(message = '') {
    this.elements.lobbyError.textContent = message;
    this.elements.lobbyError.classList.toggle('hidden', !message);
  }

  showLobby(room, localId) {
    this.localId = localId;
    this.currentRoom = room;
    this.showScreen('lobby');
    this.showLobbyError('');
    this.updateLobby(room, localId);
  }

  updateLobby(room, localId = this.localId) {
    if (!room) return;
    this.currentRoom = room;
    this.localId = localId;
    const isHost = room.hostId === localId;
    const humanPlayers = room.players ?? [];
    const emptySlots = Math.max(0, room.maxPlayers - humanPlayers.length);

    this.elements.copyCodeButton.textContent = room.code;
    this.elements.lobbyStatusText.textContent = `${humanPlayers.length}/${room.maxPlayers} human runner${humanPlayers.length === 1 ? '' : 's'} connected`;
    this.elements.lobbyTitle.textContent = isHost ? 'Configure the match' : 'Waiting in the lobby';
    this.elements.hostBadge.classList.toggle('hidden', !isHost);
    this.elements.hostSettings.classList.toggle('hidden', !isHost);
    this.elements.lobbyWaitMessage.classList.toggle('hidden', isHost);

    this.elements.lobbyPlayerCount.value = String(room.maxPlayers);
    this.elements.lobbyArena.value = room.arenaType;
    this.elements.fillBotsToggle.checked = room.fillBots;

    const cards = humanPlayers.map((player) => `
      <div class="lobby-player">
        <span class="player-color-dot" style="color:${player.color};background:${player.color}"></span>
        <strong>${escapeHtml(player.name)}${player.id === localId ? ' <span class="you-tag">YOU</span>' : ''}</strong>
        <small>${player.isHost ? 'HOST' : 'READY'}</small>
      </div>
    `);

    for (let index = 0; index < emptySlots; index += 1) {
      cards.push(`
        <div class="lobby-player empty-slot">
          <span class="player-color-dot" style="color:#51647b;background:#51647b"></span>
          <strong>${room.fillBots ? 'Bot will fill this slot' : 'Waiting for player'}</strong>
          <small>${room.fillBots ? 'BOT' : 'OPEN'}</small>
        </div>
      `);
    }
    this.elements.lobbyPlayerList.innerHTML = cards.join('');
  }

  enterGame(snapshot, localId) {
    this.localId = localId;
    this.currentRoom = { ...(this.currentRoom ?? {}), code: snapshot.code, hostId: snapshot.hostId };
    this.showScreen('game');
    this.elements.gameRoomCode.textContent = snapshot.code;
    this.elements.gameoverOverlay.classList.add('hidden');
    this.eventItems = [];
    this.elements.eventFeed.innerHTML = '';
  }

  updateGame(snapshot, localId = this.localId) {
    this.localId = localId;
    this.currentRoom = { ...(this.currentRoom ?? {}), code: snapshot.code, hostId: snapshot.hostId };
    this.elements.gameRoomCode.textContent = snapshot.code;
    this.elements.roundValue.textContent = String(snapshot.round || 1);

    const stateLabel = {
      countdown: 'Starting',
      playing: 'Live',
      transition: 'Arena shrinking',
      gameover: 'Game over',
    }[snapshot.status] ?? snapshot.status;
    this.elements.gameStateText.textContent = stateLabel;
    this.elements.stateDot.style.background = snapshot.status === 'playing' ? '#76f6a3' : '#ffd166';

    const alivePlayers = snapshot.players.filter((player) => player.alive);
    this.elements.aliveCount.textContent = String(alivePlayers.length);
    this.renderPlayerStats(snapshot);
    this.updateCenterMessage(snapshot);
    this.updateGameOver(snapshot);
  }

  updateCenterMessage(snapshot) {
    const element = this.elements.centerMessage;
    let message = '';

    if (snapshot.status === 'countdown' && snapshot.stateEndsAt) {
      const seconds = Math.max(0, Math.ceil((snapshot.stateEndsAt - Date.now()) / 1000));
      message = seconds > 0 ? String(seconds) : 'GO!';
    } else if (snapshot.status === 'transition') {
      message = 'ARENA SHRINKING';
    }

    element.textContent = message;
    element.classList.toggle('hidden', !message);
  }

  updateGameOver(snapshot) {
    const overlay = this.elements.gameoverOverlay;
    const isGameOver = snapshot.status === 'gameover';
    overlay.classList.toggle('hidden', !isGameOver);
    if (!isGameOver) return;

    const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
    const isLocalWinner = winner?.id === this.localId;
    this.elements.winnerTitle.textContent = isLocalWinner ? 'You survived!' : `${winner?.name ?? 'Nobody'} wins`;
    this.elements.winnerSubtitle.textContent = isLocalWinner
      ? 'You controlled the circuit and became the last runner standing.'
      : 'The arena belongs to the last surviving runner.';

    const isHost = snapshot.hostId === this.localId;
    this.elements.restartButton.classList.toggle('hidden', !isHost);
    this.elements.restartWait.classList.toggle('hidden', isHost);
  }

  renderPlayerStats(snapshot) {
    const sorted = [...snapshot.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return a.timer - b.timer;
    });

    this.elements.playerStatsList.innerHTML = sorted.map((player) => {
      const healthPercent = clamp((player.health / snapshot.maxHealth) * 100, 0, 100);
      const timerPercent = clamp((player.timer / snapshot.maxTimer) * 100, 0, 100);
      return `
        <div class="player-stat-card ${player.alive ? '' : 'eliminated'}">
          <div class="stat-name-row">
            <div class="stat-name">
              <span class="player-color-dot" style="color:${player.color};background:${player.color}"></span>
              <strong>${escapeHtml(player.name)}</strong>
              ${player.id === this.localId ? '<span class="you-tag">YOU</span>' : ''}
              ${player.isBot ? '<span class="bot-tag">BOT</span>' : ''}
            </div>
            <span class="zone-tag ${player.zone}">${player.alive ? escapeHtml(player.zone.toUpperCase()) : 'OUT'}</span>
          </div>
          <div class="stat-line"><span>HEALTH</span><strong>${Math.ceil(player.health)}</strong></div>
          <div class="mini-bar"><span class="health-fill" style="width:${healthPercent}%"></span></div>
          <div class="stat-line"><span>TIMER</span><strong>${player.timer.toFixed(1)}s / ${snapshot.maxTimer}s</strong></div>
          <div class="mini-bar"><span class="timer-fill" style="width:${timerPercent}%"></span></div>
        </div>
      `;
    }).join('');
  }

  addEvent(event) {
    if (!event?.message) return;
    this.eventItems.unshift(event);
    this.eventItems = this.eventItems.slice(0, 8);
    this.elements.eventFeed.innerHTML = this.eventItems
      .map((item) => `<div class="event-item">${escapeHtml(item.message)}</div>`)
      .join('');
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.remove('hidden');
    this.toastTimer = setTimeout(() => this.elements.toast.classList.add('hidden'), 2600);
  }

  resetToMenu() {
    this.currentRoom = null;
    this.eventItems = [];
    this.showMenuError('');
    this.showLobbyError('');
    this.elements.joinPanel.classList.add('hidden');
    this.elements.gameoverOverlay.classList.add('hidden');
    this.elements.centerMessage.classList.add('hidden');
    this.showScreen('menu');
  }
}
