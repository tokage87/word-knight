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
  // Tier-1 enemy: goblin (192px frames, idle 8 / run 6 / attack 4)
  goblinIdle: 'goblin-idle',
  goblinRun: 'goblin-run',
  goblinAttack: 'goblin-attack',
  // Tier-2 enemy: spider (192px frames, idle 8 / run 5 / attack 8)
  spiderIdle: 'spider-idle',
  spiderRun: 'spider-run',
  spiderAttack: 'spider-attack',
  // Tier-3+ enemy: minotaur (LARGER 320px frames, idle 16 / walk 8 / attack 12)
  minotaurIdle: 'minotaur-idle',
  minotaurRun: 'minotaur-run',
  minotaurAttack: 'minotaur-attack',
  pawnBlack: 'pawn-black',
  pawnPurple: 'pawn-purple',
  pawnYellow: 'pawn-yellow',
  pawnRed: 'pawn-red',

  // Ally units (tier-2 follower system). Blue archer shares the knight's
  // 192px frame size. Idle/Run/Shoot are 6/4/8 frames.
  archerIdle: 'archer-idle',
  archerRun: 'archer-run',
  archerShoot: 'archer-shoot',
  arrow: 'arrow',

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
  houseBlue3: 'house-blue-3',
  houseRed1: 'house-red-1',
  houseYellow1: 'house-yellow-1',
  // City (post-death meta scene)
  cityCastleBlue: 'city-castle-blue',
  cityCastleRed: 'city-castle-red',
  cityCastleYellow: 'city-castle-yellow',
  cityCastlePurple: 'city-castle-purple',
  cityTowerBlue: 'city-tower-blue',
  cityTowerRed: 'city-tower-red',
  cityBarracksBlue: 'city-barracks-blue',
  citySheepIdle: 'city-sheep-idle',
  cityBush: 'city-bush',
  cityRock1: 'city-rock-1',
  cityRock2: 'city-rock-2',
  cityWaterRocks: 'city-water-rocks',
  cityTreePine: 'city-tree-pine',
  cityTreeLeafy: 'city-tree-leafy',
  citySoldierIdle: 'city-soldier-idle',
} as const;

export const ANIM = {
  knightIdle: 'knight-idle-loop',
  knightRun: 'knight-run-loop',
  knightAttack: 'knight-attack-once',
  enemyIdle: 'enemy-idle-loop',
  enemyRun: 'enemy-run-loop',
  enemyAttack: 'enemy-attack-once',
  goblinIdle: 'goblin-idle-loop',
  goblinRun: 'goblin-run-loop',
  goblinAttack: 'goblin-attack-once',
  spiderIdle: 'spider-idle-loop',
  spiderRun: 'spider-run-loop',
  spiderAttack: 'spider-attack-once',
  minotaurIdle: 'minotaur-idle-loop',
  minotaurRun: 'minotaur-run-loop',
  minotaurAttack: 'minotaur-attack-once',
  citySheepIdle: 'city-sheep-idle-loop',
  cityBushSway: 'city-bush-sway-loop',
  pawnBlackIdle: 'pawn-black-idle-loop',
  pawnPurpleIdle: 'pawn-purple-idle-loop',
  pawnRedIdle: 'pawn-red-idle-loop',
  pawnYellowIdle: 'pawn-yellow-idle-loop',
  cityTreePineSway: 'city-tree-pine-sway-loop',
  cityTreeLeafySway: 'city-tree-leafy-sway-loop',
  citySoldierIdle: 'city-soldier-idle-loop',
  archerIdle: 'archer-idle-loop',
  archerRun: 'archer-run-loop',
  archerShoot: 'archer-shoot-once',
} as const;

// Tiny Swords unit spritesheets are always 192x192 per frame.
export const UNIT_FRAME = 192;
// Minotaur sheets are 320x320 per frame — larger silhouette.
export const MINOTAUR_FRAME = 320;

// Tiny Swords tilesets are 64x64.
export const TILE = 64;

// Grass autotile sits at cols 0-2, rows 0-2 in Tilemap_color1.png
// Center grass = row 1, col 1 = frame index 10 (9 cols per row).
export const GRASS_CENTER_FRAME = 10;
