const PLAYER_SPEED = 228;
const CHARACTER_FOLDERS = Object.freeze({
  1: 'char 1 female',
  2: 'char 2 male',
  3: 'char 3 male body',
  4: 'char 4 female',
  5: 'char 5 female',
  6: 'cahr 6 male',
  7: 'char 7 male',
});
const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);
const RUN_FRAME_COUNT = 8;
const SPRITE_SIZE = 84;
const SPRITE_TOP_OFFSET = 68;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((character) => character + character).join('')
    : normalized;
  const value = Number.parseInt(full, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.snapshot = null;
    this.localId = null;
    this.entities = new Map();
    this.characterSprites = new Map();
    this.time = 0;
    this.preloadCharacterSprites();
  }

  preloadCharacterSprites() {
    for (const [characterId, folder] of Object.entries(CHARACTER_FOLDERS)) {
      for (const direction of DIRECTIONS) {
        this.loadCharacterSprite(characterId, folder, 'walk', direction, 1);
        for (let frame = 1; frame <= RUN_FRAME_COUNT; frame += 1) {
          this.loadCharacterSprite(characterId, folder, 'run', direction, frame);
        }
      }
    }
  }

  loadCharacterSprite(characterId, folder, action, direction, frame) {
    const key = `${characterId}:${action}:${direction}:${frame}`;
    const image = new Image();
    image.src = `/characters/${encodeURIComponent(folder)}/${action}/${direction}/${frame}.png`;
    this.characterSprites.set(key, image);
  }

  setSnapshot(snapshot, localId) {
    this.snapshot = snapshot;
    this.localId = localId;
    const liveIds = new Set(snapshot.players.map((player) => player.id));

    for (const player of snapshot.players) {
      let entity = this.entities.get(player.id);
      if (!entity) {
        entity = {
          renderX: player.x,
          renderY: player.y,
          targetX: player.x,
          targetY: player.y,
          facing: 'down',
          moving: false,
          animationOffset: Math.random() * 0.5,
        };
        this.entities.set(player.id, entity);
      }

      entity.targetX = player.x;
      entity.targetY = player.y;
      const error = Math.hypot(entity.renderX - player.x, entity.renderY - player.y);
      if (error > 125 || !player.alive) {
        entity.renderX = player.x;
        entity.renderY = player.y;
      }
    }

    for (const id of this.entities.keys()) {
      if (!liveIds.has(id)) this.entities.delete(id);
    }
  }

  clear() {
    this.snapshot = null;
    this.entities.clear();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(dt, input) {
    this.time += dt;
    if (!this.snapshot) {
      this.drawIdle();
      return;
    }

    this.updateEntityPositions(dt, input);
    this.drawScene();
  }

  updateEntityPositions(dt, input) {
    for (const player of this.snapshot.players) {
      const entity = this.entities.get(player.id);
      if (!entity) continue;

      if (player.id === this.localId && player.alive && this.snapshot.status === 'playing') {
        const horizontal = Number(input.right) - Number(input.left);
        const vertical = Number(input.down) - Number(input.up);
        const magnitude = Math.hypot(horizontal, vertical);
        this.updateEntityFacing(entity, horizontal, vertical);
        if (magnitude > 0) {
          entity.renderX += (horizontal / magnitude) * PLAYER_SPEED * dt;
          entity.renderY += (vertical / magnitude) * PLAYER_SPEED * dt;
        }
        const correction = 1 - Math.exp(-3.5 * dt);
        entity.renderX += (entity.targetX - entity.renderX) * correction;
        entity.renderY += (entity.targetY - entity.renderY) * correction;
      } else {
        this.updateEntityFacing(entity, player.vx, player.vy);
        const interpolation = 1 - Math.exp(-13 * dt);
        entity.renderX += (entity.targetX - entity.renderX) * interpolation;
        entity.renderY += (entity.targetY - entity.renderY) * interpolation;
      }
    }
  }

  updateEntityFacing(entity, horizontal, vertical) {
    const magnitude = Math.hypot(horizontal, vertical);
    entity.moving = magnitude > 5 || (magnitude > 0 && magnitude <= Math.SQRT2);
    if (!entity.moving) return;
    if (Math.abs(horizontal) > Math.abs(vertical)) {
      entity.facing = horizontal < 0 ? 'left' : 'right';
    } else {
      entity.facing = vertical < 0 ? 'up' : 'down';
    }
  }

  drawIdle() {
    const { context: ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#08182b');
    gradient.addColorStop(1, '#06101d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawScene() {
    const { context: ctx, canvas, snapshot } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackground();
    this.drawArena(snapshot.arena);
    this.drawCenterZone(snapshot.arena.centerZone);
    this.drawNodes(snapshot.arena.nodes);
    this.drawPlayers(snapshot.players);
    this.drawVignette();
  }

  drawBackground() {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(640, 350, 80, 640, 350, 720);
    gradient.addColorStop(0, '#10233b');
    gradient.addColorStop(0.55, '#09172a');
    gradient.addColorStop(1, '#050b15');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#6f9bc2';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x <= 1280; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 720);
      ctx.stroke();
    }
    for (let y = 0; y <= 720; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawArena(arena) {
    const ctx = this.context;
    const boundary = arena.boundary;
    ctx.save();
    ctx.shadowColor = 'rgba(72, 190, 255, 0.3)';
    ctx.shadowBlur = 26;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(104, 224, 255, 0.82)';
    ctx.fillStyle = 'rgba(17, 42, 67, 0.62)';

    if (boundary.type === 'polygon') {
      ctx.beginPath();
      boundary.vertices.forEach((vertex, index) => {
        if (index === 0) ctx.moveTo(vertex.x, vertex.y);
        else ctx.lineTo(vertex.x, vertex.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(108, 219, 255, 0.12)';
      ctx.lineWidth = 1;
      for (const vertex of boundary.vertices) {
        ctx.beginPath();
        ctx.moveTo(boundary.x, boundary.y);
        ctx.lineTo(vertex.x, vertex.y);
        ctx.stroke();
      }
    } else if (boundary.type === 'circle') {
      ctx.beginPath();
      ctx.arc(boundary.x, boundary.y, boundary.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundedRectPath(ctx, boundary.x, boundary.y, boundary.width, boundary.height, boundary.cornerRadius ?? 12);
      ctx.fill();
      ctx.stroke();
      this.drawFootballMarkings(boundary);
    }
    ctx.restore();
  }

  drawFootballMarkings(boundary) {
    const ctx = this.context;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(210, 241, 255, 0.21)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(boundary.x + boundary.width / 2, boundary.y);
    ctx.lineTo(boundary.x + boundary.width / 2, boundary.y + boundary.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(boundary.x + boundary.width / 2, boundary.y + boundary.height / 2, 76, 0, Math.PI * 2);
    ctx.stroke();

    const boxWidth = Math.min(126, boundary.width * 0.2);
    const boxHeight = Math.min(220, boundary.height * 0.5);
    ctx.strokeRect(boundary.x, boundary.y + boundary.height / 2 - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(
      boundary.x + boundary.width - boxWidth,
      boundary.y + boundary.height / 2 - boxHeight / 2,
      boxWidth,
      boxHeight,
    );
    ctx.restore();
  }

  drawCenterZone(zone) {
    const ctx = this.context;
    const pulse = 0.55 + Math.sin(this.time * 2.3) * 0.12;
    ctx.save();
    ctx.shadowColor = `rgba(91, 139, 255, ${pulse})`;
    ctx.shadowBlur = 28;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(130, 176, 255, ${0.62 + pulse * 0.2})`;
    ctx.fillStyle = 'rgba(78, 113, 220, 0.13)';

    if (zone.type === 'circle') {
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundedRectPath(ctx, zone.x, zone.y, zone.width, zone.height, zone.cornerRadius ?? 12);
      ctx.fill();
      ctx.stroke();
    }

    const centerX = zone.type === 'circle' ? zone.x : zone.x + zone.width / 2;
    const centerY = zone.type === 'circle' ? zone.y : zone.y + zone.height / 2;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(191, 215, 255, 0.72)';
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CENTER RECOVERY', centerX, centerY + 4);
    ctx.restore();
  }

  drawNodes(nodes) {
    const ctx = this.context;
    const playersById = new Map(this.snapshot.players.map((player) => [player.id, player]));
    const localPlayer = playersById.get(this.localId);

    for (const node of nodes) {
      const occupant = node.occupantId ? playersById.get(node.occupantId) : null;
      const localLock = localPlayer?.nodeReentryLocks?.find((lock) => lock.nodeId === node.id);
      const lockRemaining = Math.max(0, (localLock?.lockedUntil ?? 0) - Date.now());
      const isLocallyLocked = !occupant && lockRemaining > 0;
      const color = occupant?.color ?? (isLocallyLocked ? '#ffd166' : '#79f4b1');
      const pulse = 1 + Math.sin(this.time * 3.2 + node.x * 0.01) * 0.04;

      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = hexToRgba(color, 0.75);
      ctx.shadowBlur = occupant ? 30 : 20;

      const gradient = ctx.createRadialGradient(-7, -9, 4, 0, 0, node.radius);
      gradient.addColorStop(0, hexToRgba(color, occupant ? 0.55 : 0.32));
      gradient.addColorStop(1, 'rgba(4, 15, 25, 0.86)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, node.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = occupant ? 5 : 3;
      ctx.strokeStyle = hexToRgba(color, occupant ? 0.96 : 0.76);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = occupant ? '#ffffff' : hexToRgba(color, 0.95);
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = occupant
        ? 'LOCKED'
        : isLocallyLocked
          ? `WAIT ${(lockRemaining / 1000).toFixed(1)}`
          : 'NODE';
      ctx.fillText(label, 0, 1);

      if (isLocallyLocked) {
        const lockFraction = clamp(
          lockRemaining / (this.snapshot.nodeReentryLockMs || 3000),
          0,
          1,
        );
        ctx.beginPath();
        ctx.arc(0, 0, node.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lockFraction);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPlayers(players) {
    const alivePlayers = players.filter((player) => player.alive);
    alivePlayers.sort((a, b) => Number(a.id === this.localId) - Number(b.id === this.localId));

    for (const player of alivePlayers) {
      const entity = this.entities.get(player.id);
      if (!entity) continue;
      this.drawPlayerBody(player, entity);
    }

    for (const player of alivePlayers) {
      const entity = this.entities.get(player.id);
      if (!entity) continue;
      this.drawPlayerStats(player, entity);
    }
  }

  drawPlayerBody(player, entity) {
    const ctx = this.context;
    const isLocal = player.id === this.localId;
    const x = entity.renderX;
    const y = entity.renderY;

    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + 8,
        player.radius + 8 + Math.sin(this.time * 4) * 1.2,
        11 + Math.sin(this.time * 4) * 0.6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    const characterId = clamp(Number(player.characterId) || 1, 1, 7);
    const action = entity.moving ? 'run' : 'walk';
    const frame = entity.moving
      ? (Math.floor((this.time + entity.animationOffset) * 12) % RUN_FRAME_COUNT) + 1
      : 1;
    const key = `${characterId}:${action}:${entity.facing}:${frame}`;
    const sprite = this.characterSprites.get(key);

    ctx.imageSmoothingEnabled = false;
    if (sprite?.complete && sprite.naturalWidth > 0) {
      ctx.shadowColor = hexToRgba(player.color, 0.72);
      ctx.shadowBlur = isLocal ? 15 : 9;
      ctx.drawImage(
        sprite,
        Math.round(x - SPRITE_SIZE / 2),
        Math.round(y - SPRITE_TOP_OFFSET),
        SPRITE_SIZE,
        SPRITE_SIZE,
      );
    } else {
      this.drawCharacterFallback(ctx, x, y, player.color);
    }
    ctx.restore();
  }

  drawCharacterFallback(ctx, x, y, color) {
    ctx.shadowColor = hexToRgba(color, 0.7);
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 23, 7, 0, Math.PI * 2);
    ctx.fill();
    roundedRectPath(ctx, x - 9, y - 16, 18, 22, 6);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 3);
    ctx.lineTo(x - 8, y + 12);
    ctx.moveTo(x + 5, y + 3);
    ctx.lineTo(x + 8, y + 12);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  drawPlayerStats(player, entity) {
    const ctx = this.context;
    const width = 124;
    const height = 46;
    let x = entity.renderX + player.radius + 12;
    let y = entity.renderY - height / 2;
    if (x + width > 1268) x = entity.renderX - player.radius - width - 12;
    y = clamp(y, 8, 720 - height - 8);

    const healthPercent = clamp(player.health / this.snapshot.maxHealth, 0, 1);
    const timerPercent = clamp(player.timer / this.snapshot.maxTimer, 0, 1);

    ctx.save();
    roundedRectPath(ctx, x, y, width, height, 8);
    ctx.fillStyle = 'rgba(4, 11, 22, 0.82)';
    ctx.fill();
    ctx.strokeStyle = player.id === this.localId
      ? 'rgba(255,255,255,0.38)'
      : hexToRgba(player.color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f1f7ff';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const displayName = player.name.length > 13 ? `${player.name.slice(0, 12)}…` : player.name;
    ctx.fillText(displayName, x + 8, y + 12);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundedRectPath(ctx, x + 8, y + 18, 72, 6, 3);
    ctx.fill();
    if (healthPercent > 0) {
      roundedRectPath(ctx, x + 8, y + 18, 72 * healthPercent, 6, 3);
      const healthGradient = ctx.createLinearGradient(x + 8, 0, x + 80, 0);
      healthGradient.addColorStop(0, '#ff587c');
      healthGradient.addColorStop(1, '#ffb36d');
      ctx.fillStyle = healthGradient;
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundedRectPath(ctx, x + 8, y + 30, 72, 6, 3);
    ctx.fill();
    if (timerPercent > 0) {
      roundedRectPath(ctx, x + 8, y + 30, 72 * timerPercent, 6, 3);
      const timerGradient = ctx.createLinearGradient(x + 8, 0, x + 80, 0);
      timerGradient.addColorStop(0, '#62e6ff');
      timerGradient.addColorStop(1, '#766dff');
      ctx.fillStyle = timerGradient;
      ctx.fill();
    }

    ctx.fillStyle = '#ff9dad';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.fillText(`H ${Math.ceil(player.health)}`, x + 86, y + 23);
    ctx.fillStyle = '#aeb9ff';
    ctx.fillText(`T ${player.timer.toFixed(0)}`, x + 86, y + 35);

    ctx.fillStyle = player.zone === 'node' ? '#7df4ad' : player.zone === 'center' ? '#91b9ff' : '#8294aa';
    ctx.font = '800 8px system-ui, sans-serif';
    ctx.fillText(player.zone.toUpperCase(), x + 8, y + 44);
    ctx.restore();
  }

  drawVignette() {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(640, 360, 250, 640, 360, 760);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1280, 720);
  }
}
