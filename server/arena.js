import { BALANCE, WORLD } from './constants.js';

const TAU = Math.PI * 2;

function regularPolygonVertices(sides, radius, startAngle = -Math.PI / 2) {
  const vertices = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = startAngle + (i * TAU) / sides;
    vertices.push({
      x: WORLD.centerX + Math.cos(angle) * radius,
      y: WORLD.centerY + Math.sin(angle) * radius,
    });
  }
  return vertices;
}

function rectanglePerimeterPoints(count, width, height) {
  if (count <= 0) return [];
  const left = WORLD.centerX - width / 2;
  const top = WORLD.centerY - height / 2;
  const perimeter = 2 * (width + height);
  const points = [];

  for (let i = 0; i < count; i += 1) {
    let distance = (i / count) * perimeter;
    let x;
    let y;

    if (distance <= width) {
      x = left + distance;
      y = top;
    } else if (distance <= width + height) {
      distance -= width;
      x = left + width;
      y = top + distance;
    } else if (distance <= 2 * width + height) {
      distance -= width + height;
      x = left + width - distance;
      y = top + height;
    } else {
      distance -= 2 * width + height;
      x = left;
      y = top + height - distance;
    }

    points.push({ x, y });
  }

  return points;
}

function circlePoints(count, radius) {
  if (count <= 0) return [];
  const points = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < count; i += 1) {
    const angle = startAngle + (i * TAU) / count;
    points.push({
      x: WORLD.centerX + Math.cos(angle) * radius,
      y: WORLD.centerY + Math.sin(angle) * radius,
    });
  }
  return points;
}

function polygonPerimeterPoints(vertices, count) {
  if (count <= 0 || vertices.length === 0) return [];

  const edges = vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    return {
      start,
      end,
      length: Math.hypot(end.x - start.x, end.y - start.y),
    };
  });
  const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
  const points = [];

  for (let index = 0; index < count; index += 1) {
    let targetDistance = (index / count) * perimeter;
    let edge = edges[0];
    for (const candidate of edges) {
      edge = candidate;
      if (targetDistance <= candidate.length) break;
      targetDistance -= candidate.length;
    }

    const progress = edge.length > 0 ? targetDistance / edge.length : 0;
    points.push({
      x: edge.start.x + (edge.end.x - edge.start.x) * progress,
      y: edge.start.y + (edge.end.y - edge.start.y) * progress,
    });
  }

  return points;
}

export function buildArena(arenaType, aliveCount, initialPlayerCount) {
  const activeNodeCount = Math.max(1, aliveCount - 1);
  const geometrySides = aliveCount === 3 ? 4 : Math.max(3, aliveCount - 1);
  const survivalRatio = aliveCount / initialPlayerCount;
  const shrink = 0.72 + survivalRatio * 0.28;
  const radius = 285 * shrink;
  const rectWidth = 840 * shrink;
  const rectHeight = 480 * shrink;

  let nodePositions = [];
  let vertices = [];
  let boundary;
  let centerZone;

  if (arenaType === 'football') {
    nodePositions = rectanglePerimeterPoints(activeNodeCount, rectWidth, rectHeight);
    boundary = {
      type: 'rectangle',
      x: WORLD.centerX - rectWidth / 2,
      y: WORLD.centerY - rectHeight / 2,
      width: rectWidth,
      height: rectHeight,
      cornerRadius: 18,
    };
    centerZone = {
      type: 'circle',
      x: WORLD.centerX,
      y: WORLD.centerY,
      radius: BALANCE.centerRadius,
    };
  } else if (arenaType === 'circle') {
    nodePositions = circlePoints(activeNodeCount, radius);
    boundary = {
      type: 'circle',
      x: WORLD.centerX,
      y: WORLD.centerY,
      radius,
    };
    centerZone = {
      type: 'rectangle',
      x: WORLD.centerX - BALANCE.centerRectWidth / 2,
      y: WORLD.centerY - BALANCE.centerRectHeight / 2,
      width: BALANCE.centerRectWidth,
      height: BALANCE.centerRectHeight,
      cornerRadius: 16,
    };
  } else {
    const polygonStartAngle = geometrySides === 4 ? -Math.PI * 3 / 4 : -Math.PI / 2;
    vertices = regularPolygonVertices(geometrySides, radius, polygonStartAngle);
    if (activeNodeCount === geometrySides) {
      nodePositions = vertices.map((point) => ({ ...point }));
    } else {
      nodePositions = polygonPerimeterPoints(vertices, activeNodeCount);
    }
    boundary = {
      type: 'polygon',
      vertices,
      sides: geometrySides,
      radius,
      x: WORLD.centerX,
      y: WORLD.centerY,
    };
    centerZone = {
      type: 'circle',
      x: WORLD.centerX,
      y: WORLD.centerY,
      radius: BALANCE.centerRadius,
    };
  }

  const nodes = nodePositions.map((point, index) => ({
    id: `node-${index}`,
    x: point.x,
    y: point.y,
    radius: BALANCE.nodeRadius,
    occupantId: null,
  }));

  return {
    arenaType,
    aliveCount,
    activeNodeCount,
    geometrySides,
    shrink,
    boundary,
    centerZone,
    nodes,
  };
}

export function isPointInsideCenterZone(x, y, centerZone, padding = 0) {
  if (centerZone.type === 'circle') {
    const dx = x - centerZone.x;
    const dy = y - centerZone.y;
    return Math.hypot(dx, dy) <= centerZone.radius - padding;
  }

  return (
    x >= centerZone.x + padding &&
    x <= centerZone.x + centerZone.width - padding &&
    y >= centerZone.y + padding &&
    y <= centerZone.y + centerZone.height - padding
  );
}

function isPointInsidePolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function keepPointInsidePolygon(x, y, radius, boundary) {
  const point = { x, y };
  if (isPointInsidePolygon(point, boundary.vertices)) return point;

  const center = { x: boundary.x, y: boundary.y };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (low + high) / 2;
    const candidate = {
      x: center.x + (x - center.x) * mid,
      y: center.y + (y - center.y) * mid,
    };
    if (isPointInsidePolygon(candidate, boundary.vertices)) low = mid;
    else high = mid;
  }

  const safety = Math.max(0, low - radius / Math.max(boundary.radius, 1));
  return {
    x: center.x + (x - center.x) * safety,
    y: center.y + (y - center.y) * safety,
  };
}

export function clampPlayerToArena(player, arena) {
  const { boundary } = arena;
  const radius = player.radius;

  if (boundary.type === 'rectangle') {
    player.x = Math.max(boundary.x + radius, Math.min(boundary.x + boundary.width - radius, player.x));
    player.y = Math.max(boundary.y + radius, Math.min(boundary.y + boundary.height - radius, player.y));
    return;
  }

  if (boundary.type === 'circle') {
    const dx = player.x - boundary.x;
    const dy = player.y - boundary.y;
    const distance = Math.hypot(dx, dy);
    const maximum = boundary.radius - radius;
    if (distance > maximum && distance > 0) {
      player.x = boundary.x + (dx / distance) * maximum;
      player.y = boundary.y + (dy / distance) * maximum;
    }
    return;
  }

  const clamped = keepPointInsidePolygon(player.x, player.y, radius, boundary);
  player.x = clamped.x;
  player.y = clamped.y;
}
