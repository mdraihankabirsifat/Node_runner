import { CONFIG } from '../config.js';

export class NodePoint {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = CONFIG.NODE.radius;
    this.occupant = null;
    this.pulseOffset = Math.random() * Math.PI * 2;
  }

  get isOccupied() {
    return Boolean(this.occupant?.alive);
  }

  release() {
    if (this.occupant) this.occupant.occupiedNode = null;
    this.occupant = null;
  }
}
