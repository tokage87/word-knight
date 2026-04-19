// Single source of truth for asset keys. The sprite-swap plan assumes
// real pixel art lives under /public/assets/<bucket>/... and is loaded
// from BootScene. Keep this file, BootScene's `preload`, and anim keys
// in lockstep.

export const AK = {
  // Units
  knightIdle: 'knight-idle',
  knightRun: 'knight-run',
  knightAttack: 'knight-attack',
  enemyIdle: 'enemy-idle',
  enemyRun: 'enemy-run',
  enemyAttack: 'enemy-attack',
  pawnBlack: 'pawn-black',
  pawnPurple: 'pawn-purple',
  pawnYellow: 'pawn-yellow',
  pawnRed: 'pawn-red',

  // Terrain & props
  tilemap: 'tilemap',
  tree: 'tree',
  bush: 'bush',
  cloud1: 'cloud-1',
  cloud2: 'cloud-2',
  cloud3: 'cloud-3',

  // Buildings
  houseBlue1: 'house-blue-1',
  houseBlue2: 'house-blue-2',
  houseRed1: 'house-red-1',
  houseYellow1: 'house-yellow-1',
} as const;

export const ANIM = {
  knightIdle: 'knight-idle-loop',
  knightRun: 'knight-run-loop',
  knightAttack: 'knight-attack-once',
  enemyIdle: 'enemy-idle-loop',
  enemyRun: 'enemy-run-loop',
  enemyAttack: 'enemy-attack-once',
} as const;

// Tiny Swords unit spritesheets are always 192x192 per frame.
export const UNIT_FRAME = 192;

// Tiny Swords tilesets are 64x64.
export const TILE = 64;

// Grass autotile sits at cols 0-2, rows 0-2 in Tilemap_color1.png
// Center grass = row 1, col 1 = frame index 10 (9 cols per row).
export const GRASS_CENTER_FRAME = 10;
