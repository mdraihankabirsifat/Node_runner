import { CONFIG } from '../config.js';
import { clamp } from '../utils.js';

export class Player {
  constructor({ id, name, x, y, color, isHuman = false }) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.color = color;
    this.isHuman = isHuman;
    this.radius = CONFIG.PLAYER.radius;
    this.speed = isHuman ? CONFIG.PLAYER.humanSpeed : CONFIG.PLAYER.botSpeed;
    this.heart = CONFIG.PLAYER.maxHeart;
    this.exposure = 0;
    this.alive = true;
    this.zone = 'center';
    this.occupiedNode = null;
    this.lastRestoredNodeId = null;
    this.nodeDwell = 0;
    this.target = null;
    this.botState = 'SEEK_NODE';
    this.decisionCooldown = 0;
    this.eliminationOrder = null;
    this.distanceTravelled = 0;
    this.nodesClaimed = 0;
    this.flash = 0;
  }

  move(dx, dy, dt) {
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.vx = dx * this.speed;
    this.vy = dy * this.speed;
    const oldX = this.x;
    const oldY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.distanceTravelled += Math.hypot(this.x - oldX, this.y - oldY);
  }

  applyHeart(delta) {
    this.heart = clamp(this.heart + delta, 0, CONFIG.PLAYER.maxHeart);
  }

  restoreAt(nodeId) {
    if (this.lastRestoredNodeId === nodeId) return false;
    this.heart = CONFIG.PLAYER.maxHeart;
    this.lastRestoredNodeId = nodeId;
    this.nodesClaimed += 1;
    this.flash = 0.45;
    return true;
  }

  get stressMultiplier() {
    return 1 + this.exposure / CONFIG.PLAYER.stressSeconds;
  }
}
