import { CONFIG } from '../config.js';
import { distance, normalize, randomRange } from '../utils.js';

export class BotAI {
  constructor(game) {
    this.game = game;
  }

  update(bot, dt) {
    bot.decisionCooldown -= dt;
    if (bot.decisionCooldown <= 0 || !bot.target) {
      this.decide(bot);
      bot.decisionCooldown = randomRange(CONFIG.BOT.decisionMin, CONFIG.BOT.decisionMax);
    }

    const target = this.resolveTarget(bot);
    if (!target) {
      bot.move(0, 0, dt);
      return;
    }

    let dx = target.x - bot.x;
    let dy = target.y - bot.y;
    const direction = normalize(dx, dy);
    let moveX = direction.x;
    let moveY = direction.y;

    for (const other of this.game.players) {
      if (!other.alive || other === bot) continue;
      const d = distance(bot, other);
      const safeDistance = bot.radius + other.radius + 12;
      if (d > 0 && d < safeDistance) {
        moveX += ((bot.x - other.x) / d) * (1 - d / safeDistance) * 1.25;
        moveY += ((bot.y - other.y) / d) * (1 - d / safeDistance) * 1.25;
      }
    }

    const adjusted = normalize(moveX, moveY);
    bot.move(adjusted.x, adjusted.y, dt);
  }

  decide(bot) {
    const availableNodes = this.game.arena.nodes.filter((node) => !node.isOccupied || node.occupant === bot);
    const validNodes = availableNodes.filter((node) => node.id !== bot.lastRestoredNodeId);

    if (bot.occupiedNode) {
      const shouldRotate = bot.heart <= CONFIG.BOT.leaveNodeHeart || bot.nodeDwell > 4.6;
      if (!shouldRotate) {
        bot.botState = 'HOLD_NODE';
        bot.target = { kind: 'node', id: bot.occupiedNode.id };
        return;
      }
      const nextNode = this.bestNode(bot, validNodes.filter((node) => node !== bot.occupiedNode));
      if (nextNode) {
        bot.botState = 'ROTATE';
        bot.target = { kind: 'node', id: nextNode.id };
        return;
      }
    }

    const critical = bot.heart < CONFIG.BOT.criticalHeart || bot.exposure > CONFIG.BOT.criticalExposure;
    const node = this.bestNode(bot, validNodes);
    if (node) {
      bot.botState = critical ? 'SEEK_NODE' : 'ROTATE';
      bot.target = { kind: 'node', id: node.id };
      return;
    }

    const centerWouldHelp = bot.heart < 78 && !bot.occupiedNode;
    if (centerWouldHelp) {
      bot.botState = 'RECOVER_CENTER';
      bot.target = { kind: 'center' };
      return;
    }

    const vulnerable = this.game.arena.nodes
      .filter((candidate) => candidate.isOccupied && candidate.occupant !== bot)
      .sort((a, b) => a.occupant.heart - b.occupant.heart)[0];

    if (vulnerable) {
      bot.botState = 'INTERCEPT';
      const angle = Math.atan2(vulnerable.y - this.game.arena.center.y, vulnerable.x - this.game.arena.center.x);
      bot.target = {
        kind: 'point',
        x: vulnerable.x - Math.cos(angle) * CONFIG.BOT.orbitDistance,
        y: vulnerable.y - Math.sin(angle) * CONFIG.BOT.orbitDistance,
      };
      return;
    }

    bot.botState = 'RECOVER_CENTER';
    bot.target = { kind: 'center' };
  }

  bestNode(bot, nodes) {
    if (!nodes.length) return null;
    return [...nodes].sort((a, b) => {
      const aScore = distance(bot, a) + (a.id === bot.lastRestoredNodeId ? 10000 : 0);
      const bScore = distance(bot, b) + (b.id === bot.lastRestoredNodeId ? 10000 : 0);
      return aScore - bScore;
    })[0];
  }

  resolveTarget(bot) {
    if (!bot.target) return null;
    if (bot.target.kind === 'center') return this.game.arena.center;
    if (bot.target.kind === 'point') return bot.target;
    if (bot.target.kind === 'node') {
      const node = this.game.arena.nodes.find((candidate) => candidate.id === bot.target.id);
      if (!node || (node.isOccupied && node.occupant !== bot)) {
        bot.target = null;
        return this.game.arena.center;
      }
      return node;
    }
    return null;
  }
}
