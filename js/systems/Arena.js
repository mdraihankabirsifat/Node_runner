import { CONFIG } from '../config.js';
import { NodePoint } from '../entities/NodePoint.js';
import { clamp, pointInPolygon } from '../utils.js';

export class Arena {
  constructor(canvas, type = 'polygon') {
    this.canvas = canvas;
    this.viewportWidth = canvas.clientWidth || canvas.width || window.innerWidth;
    this.viewportHeight = canvas.clientHeight || canvas.height || window.innerHeight;
    this.type = type;
    this.center = { x: 0, y: 0 };
    this.radius = 300;
    this.nodes = [];
    this.vertices = [];
    this.activeNodeCount = 3;
    this.geometrySides = 3;
    this.aliveCount = 4;
    this.initialAliveCount = 4;
    this.recalculateBounds();
  }

  setViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.recalculateBounds();
  }

  recalculateBounds() {
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    this.center.x = width / 2;
    this.center.y = height / 2 + Math.min(32, height * 0.03);
    const base = Math.min(width, height) * CONFIG.ARENA.baseRadiusRatio;
    this.baseRadius = clamp(base, CONFIG.ARENA.minRadius, CONFIG.ARENA.maxRadius);
    this.updateRadius();
    this.rebuildGeometry();
  }

  configure(type, aliveCount, initialAliveCount = aliveCount) {
    this.type = type;
    this.aliveCount = aliveCount;
    this.initialAliveCount = initialAliveCount;
    this.activeNodeCount = Math.max(1, aliveCount - 1);
    this.geometrySides = Math.max(3, this.activeNodeCount);
    this.updateRadius();
    this.rebuildGeometry();
  }

  updateForAliveCount(aliveCount) {
    this.releaseAllNodes();
    this.aliveCount = aliveCount;
    this.activeNodeCount = Math.max(1, aliveCount - 1);
    this.geometrySides = Math.max(3, this.activeNodeCount);
    this.updateRadius();
    this.rebuildGeometry();
  }

  updateRadius() {
    const denominator = Math.max(1, this.initialAliveCount - 1);
    const progress = (Math.max(2, this.aliveCount) - 1) / denominator;
    const scale = 0.72 + 0.28 * progress;
    this.radius = this.baseRadius * scale;
  }

  rebuildGeometry() {
    if (!this.viewportWidth || !this.viewportHeight) return;
    this.vertices = this.makePolygonVertices(this.geometrySides, this.radius);
    const positions = this.makeNodePositions(this.activeNodeCount);
    this.nodes = positions.map((position, index) => new NodePoint(index, position.x, position.y));
  }

  makePolygonVertices(sideCount, radius) {
    const vertices = [];
    const rotation = -Math.PI / 2;
    for (let i = 0; i < sideCount; i += 1) {
      const angle = rotation + (Math.PI * 2 * i) / sideCount;
      vertices.push({
        x: this.center.x + Math.cos(angle) * radius,
        y: this.center.y + Math.sin(angle) * radius,
      });
    }
    return vertices;
  }

  makeNodePositions(count) {
    if (count === 1) {
      return [{ x: this.center.x, y: this.center.y - this.radius }];
    }
    if (this.type === 'football') return this.makeRectanglePerimeterPositions(count);
    const positions = [];
    const rotation = -Math.PI / 2;
    for (let i = 0; i < count; i += 1) {
      const angle = rotation + (Math.PI * 2 * i) / count;
      positions.push({
        x: this.center.x + Math.cos(angle) * this.radius,
        y: this.center.y + Math.sin(angle) * this.radius,
      });
    }
    return positions;
  }

  makeRectanglePerimeterPositions(count) {
    const halfW = this.radius * 1.14;
    const halfH = this.radius * 0.72;
    const perimeter = 4 * (halfW + halfH);
    const positions = [];
    for (let i = 0; i < count; i += 1) {
      let d = (i / count) * perimeter;
      if (d < halfW * 2) {
        positions.push({ x: this.center.x - halfW + d, y: this.center.y - halfH });
      } else if ((d -= halfW * 2) < halfH * 2) {
        positions.push({ x: this.center.x + halfW, y: this.center.y - halfH + d });
      } else if ((d -= halfH * 2) < halfW * 2) {
        positions.push({ x: this.center.x + halfW - d, y: this.center.y + halfH });
      } else {
        d -= halfW * 2;
        positions.push({ x: this.center.x - halfW, y: this.center.y + halfH - d });
      }
    }
    return positions;
  }

  releaseAllNodes() {
    this.nodes.forEach((node) => node.release());
  }

  isInsideCenterZone(player) {
    if (this.type === 'circle') {
      return Math.abs(player.x - this.center.x) <= CONFIG.ARENA.centerRectWidth / 2 &&
        Math.abs(player.y - this.center.y) <= CONFIG.ARENA.centerRectHeight / 2;
    }
    return Math.hypot(player.x - this.center.x, player.y - this.center.y) <= CONFIG.ARENA.centerCircleRadius;
  }

  containsPoint(x, y, padding = 0) {
    if (this.type === 'circle') {
      return Math.hypot(x - this.center.x, y - this.center.y) <= this.radius - padding;
    }
    if (this.type === 'football') {
      const halfW = this.radius * 1.14 - padding;
      const halfH = this.radius * 0.72 - padding;
      return Math.abs(x - this.center.x) <= halfW && Math.abs(y - this.center.y) <= halfH;
    }
    if (padding <= 0) return pointInPolygon({ x, y }, this.vertices);
    const scale = Math.max(0.1, (this.radius - padding) / this.radius);
    const inset = this.vertices.map((vertex) => ({
      x: this.center.x + (vertex.x - this.center.x) * scale,
      y: this.center.y + (vertex.y - this.center.y) * scale,
    }));
    return pointInPolygon({ x, y }, inset);
  }

  constrainPlayer(player) {
    if (this.containsPoint(player.x, player.y, player.radius + 6)) return;
    if (this.type === 'football') {
      const halfW = this.radius * 1.14 - player.radius - 6;
      const halfH = this.radius * 0.72 - player.radius - 6;
      player.x = clamp(player.x, this.center.x - halfW, this.center.x + halfW);
      player.y = clamp(player.y, this.center.y - halfH, this.center.y + halfH);
      return;
    }
    const angle = Math.atan2(player.y - this.center.y, player.x - this.center.x);
    let low = 0;
    let high = Math.hypot(player.x - this.center.x, player.y - this.center.y);
    for (let i = 0; i < 12; i += 1) {
      const mid = (low + high) / 2;
      const testX = this.center.x + Math.cos(angle) * mid;
      const testY = this.center.y + Math.sin(angle) * mid;
      if (this.containsPoint(testX, testY, player.radius + 6)) low = mid;
      else high = mid;
    }
    player.x = this.center.x + Math.cos(angle) * low;
    player.y = this.center.y + Math.sin(angle) * low;
  }
}
