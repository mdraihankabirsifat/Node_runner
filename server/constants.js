export const WORLD = Object.freeze({
  width: 1280,
  height: 720,
  centerX: 640,
  centerY: 360,
});

export const BALANCE = Object.freeze({
  minPlayers: 4,
  maxPlayers: 8,
  playerRadius: 16,
  playerSpeed: 228,
  botSpeedMultiplier: 0.94,
  nodeRadius: 31,
  centerRadius: 74,
  centerRectWidth: 170,
  centerRectHeight: 92,

  maxHealth: 100,
  maxTimer: 150,
  timerRateOutsideNode: 1,
  nodeHealthDrainPerSecond: 8.5,
  fieldHealthDrainPerSecond: 0.75,
  centerHealthRecoveryPerSecond: 5.5,
  timerPressureDamagePerSecond: 2.2,
  criticalTimerFraction: 0.8,

  countdownSeconds: 3,
  transitionSeconds: 1.8,
  snapshotRate: 20,
  tickRate: 30,
  roomIdleDeleteMs: 15 * 60 * 1000,
});

export const PLAYER_COLORS = Object.freeze([
  '#6EE7FF',
  '#FF6B9A',
  '#FFD166',
  '#8BFF9F',
  '#BFA7FF',
  '#FF9F68',
  '#72A7FF',
  '#F4FF7A',
]);

export const BOT_NAMES = Object.freeze([
  'Nova',
  'Pulse',
  'Orbit',
  'Vex',
  'Kite',
  'Flux',
  'Echo',
  'Dash',
]);
