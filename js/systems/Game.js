import { CONFIG } from '../config.js';
import { Player } from '../entities/Player.js';
import { Arena } from './Arena.js';
import { BotAI } from './BotAI.js';
import { clamp, distance, formatSeconds, lerp, normalize, roundedRectPath } from '../utils.js';

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.arena = new Arena(canvas);
    this.botAI = new BotAI(this);
    this.players = [];
    this.keys = new Set();
    this.phase = 'idle';
    this.previousPhase = null;
    this.countdown = 0;
    this.transitionTimer = 0;
    this.lastTimestamp = 0;
    this.animationId = null;
    this.initialPlayerCount = 4;
    this.arenaType = 'polygon';
    this.matchElapsed = 0;
    this.eliminationCount = 0;
    this.feed = [];
    this.shake = 0;
    this.soundEnabled = true;
    this.onGameOver = null;
    this.installInput();
  }

  installInput() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
      this.keys.add(key);
      if ((key === 'p' || key === 'escape') && this.phase !== 'idle' && this.phase !== 'gameover') {
        this.togglePause();
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      if (this.phase === 'playing' || this.phase === 'countdown' || this.phase === 'transition') this.pause();
    });
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  start({ playerCount, arenaType }) {
    this.stopLoop();
    this.resize();
    this.initialPlayerCount = playerCount;
    this.arenaType = arenaType;
    this.matchElapsed = 0;
    this.eliminationCount = 0;
    this.feed = [];
    this.shake = 0;
    this.phase = 'countdown';
    this.countdown = CONFIG.GAME.startCountdown;
    this.arena.configure(arenaType, playerCount, playerCount);
    this.createPlayers(playerCount);
    this.updateHud();
    this.lastTimestamp = performance.now();
    this.animationId = requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  createPlayers(count) {
    this.players = [];
    const spawnRadius = Math.min(44, 8 + count * 4);
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      this.players.push(new Player({
        id: i,
        name: i === 0 ? 'You' : `Bot ${i}`,
        x: this.arena.center.x + Math.cos(angle) * spawnRadius,
        y: this.arena.center.y + Math.sin(angle) * spawnRadius,
        color: CONFIG.COLORS[i % CONFIG.COLORS.length],
        isHuman: i === 0,
      }));
    }
  }

  loop(timestamp) {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(rawDt || 0, CONFIG.GAME.maxDelta);
    this.lastTimestamp = timestamp;

    if (this.phase !== 'paused' && this.phase !== 'idle' && this.phase !== 'gameover') {
      this.update(dt);
    }
    this.render(timestamp / 1000);
    this.animationId = requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    this.updateFeed(dt);
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.addFeed('<strong>RUN!</strong> Find a free node.');
        this.beep(620, 0.08);
      }
      this.updateHud();
      return;
    }

    if (this.phase === 'transition') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this.phase = 'countdown';
        this.countdown = CONFIG.ARENA.roundCountdown;
        this.repositionAlivePlayers();
      }
      this.updateHud();
      return;
    }

    if (this.phase !== 'playing') return;
    this.matchElapsed += dt;

    for (const player of this.players) {
      if (!player.alive) continue;
      if (player.isHuman) this.updateHuman(player, dt);
      else this.botAI.update(player, dt);
      this.arena.constrainPlayer(player);
      player.flash = Math.max(0, player.flash - dt);
    }

    this.resolvePlayerSeparation(dt);
    this.updateNodeClaims();

    const eliminated = [];
    for (const player of this.players) {
      if (!player.alive) continue;
      this.updatePlayerVitals(player, dt);
      if (player.heart <= 0) eliminated.push(player);
    }

    for (const player of eliminated) this.eliminate(player);
    if (eliminated.length) this.afterEliminations();
    this.updateHud();
  }

  updateHuman(player, dt) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    player.move(dx, dy, dt);
  }

  resolvePlayerSeparation(dt) {
    const alive = this.alivePlayers;
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minDistance = a.radius + b.radius + 2;
        if (d <= 0 || d >= minDistance) continue;
        const overlap = minDistance - d;
        const nx = dx / d;
        const ny = dy / d;
        const correction = Math.min(overlap * 0.5, CONFIG.PLAYER.separationForce * dt);
        if (!a.occupiedNode) { a.x -= nx * correction; a.y -= ny * correction; }
        if (!b.occupiedNode) { b.x += nx * correction; b.y += ny * correction; }
      }
    }
  }

  updateNodeClaims() {
    for (const player of this.alivePlayers) {
      if (player.occupiedNode) {
        const stillInside = distance(player, player.occupiedNode) <= player.occupiedNode.radius + player.radius + 2;
        if (!stillInside) {
          player.occupiedNode.occupant = null;
          player.occupiedNode = null;
          player.nodeDwell = 0;
        }
      }
    }

    const unclaimedPlayers = this.alivePlayers.filter((player) => !player.occupiedNode);
    const attempts = [];
    for (const player of unclaimedPlayers) {
      for (const node of this.arena.nodes) {
        if (node.isOccupied) continue;
        const d = distance(player, node);
        if (d <= node.radius + player.radius - CONFIG.NODE.claimPadding) {
          attempts.push({ player, node, d });
        }
      }
    }

    attempts.sort((a, b) => a.d - b.d);
    const assignedPlayers = new Set();
    const assignedNodes = new Set();
    for (const attempt of attempts) {
      if (assignedPlayers.has(attempt.player.id) || assignedNodes.has(attempt.node.id) || attempt.node.isOccupied) continue;
      attempt.node.occupant = attempt.player;
      attempt.player.occupiedNode = attempt.node;
      attempt.player.nodeDwell = 0;
      assignedPlayers.add(attempt.player.id);
      assignedNodes.add(attempt.node.id);
      const restored = attempt.player.restoreAt(attempt.node.id);
      if (restored) {
        this.addFeed(`<strong>${attempt.player.name}</strong> claimed Node ${attempt.node.id + 1}.`);
        this.beep(attempt.player.isHuman ? 540 : 420, 0.055);
      }
    }
  }

  updatePlayerVitals(player, dt) {
    if (player.occupiedNode) {
      player.zone = 'node';
      player.nodeDwell += dt;
      player.applyHeart(-CONFIG.PLAYER.nodeDrain * dt);
      return;
    }

    player.exposure += dt;
    player.nodeDwell = 0;
    if (this.arena.isInsideCenterZone(player)) {
      player.zone = 'center';
      const netPerSecond = CONFIG.PLAYER.centerHeal - CONFIG.PLAYER.centerStressDrain * player.stressMultiplier;
      player.applyHeart(netPerSecond * dt);
    } else {
      player.zone = 'field';
      player.applyHeart(-CONFIG.PLAYER.fieldDrain * player.stressMultiplier * dt);
    }
  }

  eliminate(player) {
    if (!player.alive) return;
    player.alive = false;
    player.heart = 0;
    this.eliminationCount += 1;
    player.eliminationOrder = this.eliminationCount;
    if (player.occupiedNode) player.occupiedNode.release();
    this.addFeed(`<strong>${player.name}</strong> flatlined.`);
    this.shake = 0.55;
    this.beep(120, 0.2);
  }

  afterEliminations() {
    const aliveCount = this.alivePlayers.length;
    if (aliveCount <= 1) {
      this.finishGame();
      return;
    }
    this.arena.releaseAllNodes();
    this.arena.updateForAliveCount(aliveCount);
    for (const player of this.alivePlayers) {
      player.target = null;
      player.nodeDwell = 0;
    }
    this.phase = 'transition';
    this.transitionTimer = CONFIG.ARENA.shrinkDuration;
    this.addFeed(`<strong>ARENA SHRINK</strong> ${Math.max(1, aliveCount - 1)} node${aliveCount - 1 === 1 ? '' : 's'} remain.`);
  }

  repositionAlivePlayers() {
    const alive = this.alivePlayers;
    const spawnRadius = Math.min(36, 8 + alive.length * 4);
    alive.forEach((player, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / alive.length;
      player.x = this.arena.center.x + Math.cos(angle) * spawnRadius;
      player.y = this.arena.center.y + Math.sin(angle) * spawnRadius;
      player.vx = 0;
      player.vy = 0;
      player.target = null;
    });
  }

  finishGame() {
    this.phase = 'gameover';
    this.arena.releaseAllNodes();
    const winner = this.alivePlayers[0] ?? null;
    if (this.onGameOver) this.onGameOver({
      winner,
      human: this.humanPlayer,
      matchElapsed: this.matchElapsed,
      initialPlayerCount: this.initialPlayerCount,
    });
  }

  pause() {
    if (!['playing', 'countdown', 'transition'].includes(this.phase)) return;
    this.previousPhase = this.phase;
    this.phase = 'paused';
    this.ui.pauseOverlay.hidden = false;
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.previousPhase || 'playing';
    this.previousPhase = null;
    this.ui.pauseOverlay.hidden = true;
    this.lastTimestamp = performance.now();
  }

  togglePause() {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  stopLoop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.phase = 'idle';
    this.arena.releaseAllNodes();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;
    const oldCenter = { ...this.arena.center };
    this.arena.releaseAllNodes();
    this.players.forEach((player) => { player.occupiedNode = null; });
    this.arena.setViewport(rect.width, rect.height);
    if (this.players.length && oldCenter.x) {
      const offsetX = this.arena.center.x - oldCenter.x;
      const offsetY = this.arena.center.y - oldCenter.y;
      this.players.forEach((player) => { player.x += offsetX; player.y += offsetY; });
    }
  }

  render(time) {
    const ctx = this.ctx;
    const width = this.logicalWidth || this.canvas.clientWidth;
    const height = this.logicalHeight || this.canvas.clientHeight;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height, time);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0) {
      shakeX = (Math.random() - 0.5) * 9 * this.shake;
      shakeY = (Math.random() - 0.5) * 9 * this.shake;
      this.shake = Math.max(0, this.shake - 0.025);
    }
    ctx.translate(shakeX, shakeY);
    this.drawArena(ctx, time);
    this.drawCenterZone(ctx, time);
    this.drawNodes(ctx, time);
    this.drawPlayers(ctx, time);
    ctx.restore();
    this.drawCountdown();
  }

  drawBackground(ctx, width, height, time) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, Math.max(width, height) * 0.7);
    gradient.addColorStop(0, '#102a23');
    gradient.addColorStop(0.55, '#081613');
    gradient.addColorStop(1, '#030908');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(117,255,182,0.035)';
    ctx.lineWidth = 1;
    const spacing = 46;
    const shift = (time * 7) % spacing;
    for (let x = -spacing + shift; x < width + spacing; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = -spacing + shift; y < height + spacing; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  }

  drawArena(ctx, time) {
    ctx.save();
    ctx.shadowColor = 'rgba(117,255,182,0.18)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(12,31,26,0.78)';
    ctx.strokeStyle = 'rgba(117,255,182,0.54)';
    ctx.lineWidth = 2;

    if (this.arena.type === 'circle') {
      ctx.beginPath();
      ctx.arc(this.arena.center.x, this.arena.center.y, this.arena.radius, 0, Math.PI * 2);
    } else if (this.arena.type === 'football') {
      const halfW = this.arena.radius * 1.14;
      const halfH = this.arena.radius * 0.72;
      roundedRectPath(ctx, this.arena.center.x - halfW, this.arena.center.y - halfH, halfW * 2, halfH * 2, 16);
    } else {
      ctx.beginPath();
      this.arena.vertices.forEach((vertex, index) => index ? ctx.lineTo(vertex.x, vertex.y) : ctx.moveTo(vertex.x, vertex.y));
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = 'rgba(117,255,182,0.09)';
    ctx.lineWidth = 1;
    if (this.arena.type === 'circle') {
      ctx.beginPath(); ctx.arc(this.arena.center.x, this.arena.center.y, this.arena.radius * 0.72, 0, Math.PI * 2); ctx.stroke();
    } else if (this.arena.type === 'football') {
      const halfW = this.arena.radius * 1.14;
      const halfH = this.arena.radius * 0.72;
      ctx.beginPath(); ctx.moveTo(this.arena.center.x, this.arena.center.y - halfH); ctx.lineTo(this.arena.center.x, this.arena.center.y + halfH); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.arena.center.x, this.arena.center.y, Math.min(58, this.arena.radius * .2), 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath();
      this.arena.vertices.forEach((vertex) => { ctx.moveTo(this.arena.center.x, this.arena.center.y); ctx.lineTo(vertex.x, vertex.y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawCenterZone(ctx, time) {
    const pulse = 1 + Math.sin(time * 2.2) * 0.035;
    ctx.save();
    ctx.translate(this.arena.center.x, this.arena.center.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(89,219,255,0.07)';
    ctx.strokeStyle = 'rgba(99,233,255,0.58)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    if (this.arena.type === 'circle') {
      roundedRectPath(ctx, -CONFIG.ARENA.centerRectWidth / 2, -CONFIG.ARENA.centerRectHeight / 2, CONFIG.ARENA.centerRectWidth, CONFIG.ARENA.centerRectHeight, 12);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, CONFIG.ARENA.centerCircleRadius, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(181,242,255,.68)';
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RECOVERY', 0, 4);
    ctx.restore();
  }

  drawNodes(ctx, time) {
    const human = this.humanPlayer;
    for (const node of this.arena.nodes) {
      const pulse = (Math.sin(time * CONFIG.NODE.glowPulseSpeed + node.pulseOffset) + 1) / 2;
      const occupiedColor = node.occupant?.color;
      const invalidForHuman = human?.alive && human.lastRestoredNodeId === node.id && node.occupant !== human;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.shadowColor = occupiedColor || (invalidForHuman ? '#ff617d' : '#75ffb6');
      ctx.shadowBlur = 12 + pulse * 14;
      ctx.beginPath();
      ctx.arc(0, 0, node.radius + 5 + pulse * 2, 0, Math.PI * 2);
      ctx.strokeStyle = occupiedColor || (invalidForHuman ? 'rgba(255,97,125,.62)' : 'rgba(117,255,182,.58)');
      ctx.lineWidth = 2;
      if (invalidForHuman) ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = occupiedColor ? `${occupiedColor}2a` : 'rgba(117,255,182,.08)';
      ctx.fill();
      ctx.strokeStyle = occupiedColor || 'rgba(174,255,216,.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = occupiedColor || (invalidForHuman ? '#ff8499' : '#d7ffeb');
      ctx.font = '900 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.isOccupied ? 'LOCK' : `${node.id + 1}`, 0, 1);
      ctx.restore();
    }
  }

  drawPlayers(ctx, time) {
    const alivePlayers = this.players.filter((player) => player.alive);
    const deadPlayers = this.players.filter((player) => !player.alive);
    deadPlayers.forEach((player) => this.drawDeadPlayer(ctx, player));
    alivePlayers.forEach((player) => this.drawPlayer(ctx, player, time));
  }

  drawPlayer(ctx, player, time) {
    const lowHeart = player.heart < 30;
    const pulseScale = lowHeart ? 1 + Math.sin(time * 9) * .08 : 1;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(pulseScale, pulseScale);
    ctx.shadowColor = player.color;
    ctx.shadowBlur = player.flash > 0 ? 24 : 10;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius - 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3,12,10,.62)';
    ctx.fill();
    ctx.fillStyle = player.color;
    ctx.font = '900 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.isHuman ? 'YOU' : String(player.id), 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(-18, player.radius + 7, 36, 4);
    ctx.fillStyle = player.heart < 35 ? '#ff617d' : player.color;
    ctx.fillRect(-18, player.radius + 7, 36 * (player.heart / CONFIG.PLAYER.maxHeart), 4);
    ctx.restore();
  }

  drawDeadPlayer(ctx, player) {
    ctx.save();
    ctx.globalAlpha = .16;
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x - 10, player.y - 10); ctx.lineTo(player.x + 10, player.y + 10);
    ctx.moveTo(player.x + 10, player.y - 10); ctx.lineTo(player.x - 10, player.y + 10);
    ctx.stroke();
    ctx.restore();
  }

  drawCountdown() {
    if (this.phase === 'countdown') {
      const number = Math.ceil(this.countdown);
      this.ui.countdownOverlay.innerHTML = number > 0 ? String(number) : '<span class="go">RUN!</span>';
    } else if (this.phase === 'transition') {
      this.ui.countdownOverlay.innerHTML = '<span class="go">SHRINKING</span>';
    } else {
      this.ui.countdownOverlay.textContent = '';
    }
  }

  updateHud() {
    const human = this.humanPlayer;
    this.ui.aliveLabel.textContent = `${this.alivePlayers.length} ALIVE`;
    this.ui.arenaLabel.textContent = this.arenaType.toUpperCase();
    this.ui.phaseLabel.textContent = this.phase === 'transition' ? 'ARENA SHIFT' : this.phase.toUpperCase();
    if (!human) return;
    this.ui.heartValue.textContent = Math.ceil(human.heart);
    this.ui.heartBar.style.width = `${human.heart}%`;
    this.ui.exposureValue.textContent = formatSeconds(human.exposure);
    this.ui.exposureBar.style.width = `${clamp(human.exposure / 60, 0, 1) * 100}%`;
    this.ui.zoneLabel.textContent = human.alive ? human.zone.toUpperCase() : 'ELIMINATED';

    if (!human.alive) this.ui.statusHint.textContent = 'You are out. Watch the remaining runners finish.';
    else if (human.occupiedNode) this.ui.statusHint.textContent = 'Exposure paused—but your heart is draining. Rotate soon.';
    else if (human.zone === 'center') this.ui.statusHint.textContent = 'Recovering slowly. Exposure continues to rise.';
    else if (human.lastRestoredNodeId !== null) this.ui.statusHint.textContent = `Node ${human.lastRestoredNodeId + 1} cannot restore you again consecutively.`;
    else this.ui.statusHint.textContent = 'Move to a free node to restore your heart.';
  }

  updateFeed(dt) {
    this.feed.forEach((item) => { item.life -= dt; });
    this.feed = this.feed.filter((item) => item.life > 0);
    this.ui.eventFeed.innerHTML = this.feed.map((item) => `<div class="feed-item">${item.html}</div>`).join('');
  }

  addFeed(html) {
    this.feed.unshift({ html, life: CONFIG.GAME.feedLifetime });
    this.feed = this.feed.slice(0, 4);
    this.ui.eventFeed.innerHTML = this.feed.map((item) => `<div class="feed-item">${item.html}</div>`).join('');
  }

  beep(frequency, duration) {
    if (!this.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext ??= new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.04, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + duration);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch {
      // Audio is optional; browsers can block it before user interaction.
    }
  }

  get alivePlayers() {
    return this.players.filter((player) => player.alive);
  }

  get humanPlayer() {
    return this.players.find((player) => player.isHuman);
  }
}
