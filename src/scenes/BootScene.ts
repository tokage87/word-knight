import Phaser from 'phaser';
import { AK, ANIM, UNIT_FRAME, MINOTAUR_FRAME, TILE } from '../constants/assetKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Knight (Tiny Swords Blue Warrior)
    this.load.spritesheet(AK.knightIdle, 'assets/knight/idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.knightRun, 'assets/knight/run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.knightAttack, 'assets/knight/attack.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Enemy tier 0: Tiny Swords Skull
    this.load.spritesheet(AK.enemyIdle, 'assets/enemy/idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.enemyRun, 'assets/enemy/run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.enemyAttack, 'assets/enemy/attack.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Enemy tier 1: Goblin (same 192px frame pattern)
    this.load.spritesheet(AK.goblinIdle, 'assets/goblin/idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.goblinRun, 'assets/goblin/run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.goblinAttack, 'assets/goblin/attack.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Enemy tier 2: Spider (192px frames; fewer run frames, more attack)
    this.load.spritesheet(AK.spiderIdle, 'assets/spider/idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.spiderRun, 'assets/spider/run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.spiderAttack, 'assets/spider/attack.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Enemy tier 3+: Minotaur — BIGGER 320x320 frames.
    this.load.spritesheet(AK.minotaurIdle, 'assets/minotaur/idle.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });
    this.load.spritesheet(AK.minotaurRun, 'assets/minotaur/run.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });
    this.load.spritesheet(AK.minotaurAttack, 'assets/minotaur/attack.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });

    // Villager crowd (static — idle frame 0 only)
    this.load.spritesheet(AK.pawnBlack, 'assets/villager/pawn-black.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.pawnPurple, 'assets/villager/pawn-purple.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.pawnYellow, 'assets/villager/pawn-yellow.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.pawnRed, 'assets/villager/pawn-red.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Tileset (used as a tiled spritesheet for the ground)
    this.load.spritesheet(AK.tilemap, 'assets/terrain/tilemap.png', {
      frameWidth: TILE,
      frameHeight: TILE,
    });

    // Static props
    this.load.image(AK.tree, 'assets/decorations/tree.png');
    this.load.image(AK.bush, 'assets/decorations/bush.png');
    this.load.image(AK.cloud1, 'assets/clouds/cloud1.png');
    this.load.image(AK.cloud2, 'assets/clouds/cloud2.png');
    this.load.image(AK.cloud3, 'assets/clouds/cloud3.png');

    // Buildings
    this.load.image(AK.houseBlue1, 'assets/buildings/house-blue-1.png');
    this.load.image(AK.houseBlue2, 'assets/buildings/house-blue-2.png');
    this.load.image(AK.houseRed1, 'assets/buildings/house-red-1.png');
    this.load.image(AK.houseYellow1, 'assets/buildings/house-yellow-1.png');

    // City-only assets: bigger buildings + ambient life for the
    // post-death meta scene. Sheep + bush are animated spritesheets
    // (128px and 64px frames respectively), everything else is a
    // single image.
    this.load.image(AK.cityCastleBlue,   'assets/city/castle-blue.png');
    this.load.image(AK.cityCastleRed,    'assets/city/castle-red.png');
    this.load.image(AK.cityCastleYellow, 'assets/city/castle-yellow.png');
    this.load.image(AK.cityCastlePurple, 'assets/city/castle-purple.png');
    this.load.image(AK.cityTowerBlue,    'assets/city/tower-blue.png');
    this.load.image(AK.cityTowerRed,     'assets/city/tower-red.png');
    this.load.image(AK.cityBarracksBlue, 'assets/city/barracks-blue.png');
    this.load.image(AK.houseBlue3,       'assets/city/house-blue-3.png');
    this.load.image(AK.cityRock1,        'assets/city/rock-1.png');
    this.load.image(AK.cityRock2,        'assets/city/rock-2.png');
    this.load.spritesheet(AK.citySheepIdle, 'assets/city/sheep-idle.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    // Bush sheet is 1024×128 — 8 frames of 128×128. Using a 64×128
    // frame size (as we did initially) produced an empty animation
    // because the bush outgrew the horizontal half of each frame.
    this.load.spritesheet(AK.cityBush, 'assets/city/bush-sheet.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet(AK.cityWaterRocks, 'assets/city/water-rocks.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    // Trees — 8 frames each. Pine tree is taller (192×256), leafy is
    // the same 192 square as the rest.
    this.load.spritesheet(AK.cityTreePine, 'assets/city/tree-pine.png', {
      frameWidth: 192,
      frameHeight: 256,
    });
    this.load.spritesheet(AK.cityTreeLeafy, 'assets/city/tree-leafy.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    // Blue faction warrior idle — 8-frame spritesheet, used as guard
    // NPCs flanking the castle in the City scene.
    this.load.spritesheet(AK.citySoldierIdle, 'assets/city/soldier-idle.png', {
      frameWidth: 192,
      frameHeight: 192,
    });

    // Ally tier-2 sprites: Blue Archer + Arrow projectile. Same 192px
    // frame size as the knight; idle 6f, run 4f, shoot 8f. Arrow is a
    // single 64x64 sprite.
    this.load.spritesheet(AK.archerIdle, 'assets/archer/Archer_Idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.archerRun, 'assets/archer/Archer_Run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.archerShoot, 'assets/archer/Archer_Shoot.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.image(AK.arrow, 'assets/archer/Arrow.png');

    // Monk ally sprites (used by Cleric, Fire Monk, Ice Monk, Wind Monk).
    // Shared 192px frame size; Heal.png is the cast animation we reuse
    // for every monk variant.
    this.load.spritesheet(AK.monkIdle, 'assets/monk/Idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.monkRun, 'assets/monk/Run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.monkHeal, 'assets/monk/Heal.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.monkHealEffect, 'assets/monk/Heal_Effect.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });

    // Lancer ally sprites — 320px frame (same size family as the
    // minotaur enemy). Used by Wind Lancer and Earth Lancer.
    this.load.spritesheet(AK.lancerIdle, 'assets/lancer/Idle.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });
    this.load.spritesheet(AK.lancerRun, 'assets/lancer/Run.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });
    this.load.spritesheet(AK.lancerAttack, 'assets/lancer/Attack.png', {
      frameWidth: MINOTAUR_FRAME,
      frameHeight: MINOTAUR_FRAME,
    });

    // Pawn (Axe variant) — 192px frame. The "interact" sheet shows
    // the pawn swinging its axe; we reuse it as a melee attack
    // animation for Earth Pawn (the sprite pack doesn't ship a real
    // attack anim for the pawn archetype).
    this.load.spritesheet(AK.pawnAxeIdle, 'assets/pawn/Idle.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.pawnAxeRun, 'assets/pawn/Run.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
    this.load.spritesheet(AK.pawnAxeAttack, 'assets/pawn/Attack.png', {
      frameWidth: UNIT_FRAME,
      frameHeight: UNIT_FRAME,
    });
  }

  create() {
    this.buildAnim(ANIM.knightIdle, AK.knightIdle, 8, 8, -1);
    this.buildAnim(ANIM.knightRun, AK.knightRun, 6, 12, -1);
    this.buildAnim(ANIM.knightAttack, AK.knightAttack, 4, 14, 0);
    // Skull: idle 8f, run 6f, attack 7f
    this.buildAnim(ANIM.enemyIdle, AK.enemyIdle, 8, 7, -1);
    this.buildAnim(ANIM.enemyRun, AK.enemyRun, 6, 11, -1);
    this.buildAnim(ANIM.enemyAttack, AK.enemyAttack, 7, 14, 0);
    // Goblin: idle 8f, run 6f, attack 4f
    this.buildAnim(ANIM.goblinIdle, AK.goblinIdle, 8, 7, -1);
    this.buildAnim(ANIM.goblinRun, AK.goblinRun, 6, 12, -1);
    this.buildAnim(ANIM.goblinAttack, AK.goblinAttack, 4, 14, 0);
    // Spider: idle 8f, run 5f, attack 8f
    this.buildAnim(ANIM.spiderIdle, AK.spiderIdle, 8, 7, -1);
    this.buildAnim(ANIM.spiderRun, AK.spiderRun, 5, 11, -1);
    this.buildAnim(ANIM.spiderAttack, AK.spiderAttack, 8, 14, 0);
    // Minotaur: idle 16f, walk 8f, attack 12f — slower frame rates to
    // emphasise the heavy silhouette.
    this.buildAnim(ANIM.minotaurIdle, AK.minotaurIdle, 16, 8, -1);
    this.buildAnim(ANIM.minotaurRun, AK.minotaurRun, 8, 10, -1);
    this.buildAnim(ANIM.minotaurAttack, AK.minotaurAttack, 12, 12, 0);
    // City ambient loops — slow frame rates so the scene feels calm.
    this.buildAnim(ANIM.citySheepIdle, AK.citySheepIdle, 8, 6, -1);
    // 8 bush frames sway at 6 fps — the sheet is 8×(128×128).
    this.buildAnim(ANIM.cityBushSway, AK.cityBush, 8, 6, -1);
    // Pawn idle loops (8 frames at 192×192 each, shared across colors).
    // Used to animate wandering villagers in the City scene.
    this.buildAnim(ANIM.pawnBlackIdle, AK.pawnBlack, 8, 7, -1);
    this.buildAnim(ANIM.pawnPurpleIdle, AK.pawnPurple, 8, 7, -1);
    this.buildAnim(ANIM.pawnRedIdle, AK.pawnRed, 8, 7, -1);
    this.buildAnim(ANIM.pawnYellowIdle, AK.pawnYellow, 8, 7, -1);
    this.buildAnim(ANIM.cityTreePineSway, AK.cityTreePine, 8, 5, -1);
    this.buildAnim(ANIM.cityTreeLeafySway, AK.cityTreeLeafy, 8, 5, -1);
    this.buildAnim(ANIM.citySoldierIdle, AK.citySoldierIdle, 8, 7, -1);
    // Archer ally animations. Shoot plays once per fire; idle/run loop.
    this.buildAnim(ANIM.archerIdle, AK.archerIdle, 6, 7, -1);
    this.buildAnim(ANIM.archerRun, AK.archerRun, 4, 10, -1);
    this.buildAnim(ANIM.archerShoot, AK.archerShoot, 8, 14, 0);
    // Monk ally animations. Cast is the Heal sheet — it's the only
    // "action" animation the monk sprite ships with, so we reuse it
    // for every monk-flavored cast (cleric heal + offensive casts).
    this.buildAnim(ANIM.monkIdle, AK.monkIdle, 6, 7, -1);
    this.buildAnim(ANIM.monkRun, AK.monkRun, 4, 10, -1);
    this.buildAnim(ANIM.monkCast, AK.monkHeal, 11, 14, 0);
    // Lancer ally animations (320px frames). Idle 12f, Run 6f, Attack 3f.
    this.buildAnim(ANIM.lancerIdle, AK.lancerIdle, 12, 8, -1);
    this.buildAnim(ANIM.lancerRun, AK.lancerRun, 6, 10, -1);
    this.buildAnim(ANIM.lancerAttack, AK.lancerAttack, 3, 12, 0);
    // Axe Pawn ally animations. Idle 8f, Run 6f, Attack (axe swing) 6f.
    this.buildAnim(ANIM.pawnAxeIdle, AK.pawnAxeIdle, 8, 7, -1);
    this.buildAnim(ANIM.pawnAxeRun, AK.pawnAxeRun, 6, 10, -1);
    this.buildAnim(ANIM.pawnAxeAttack, AK.pawnAxeAttack, 6, 11, 0);

    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private buildAnim(
    key: string,
    textureKey: string,
    frameCount: number,
    frameRate: number,
    repeat: number,
  ) {
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(textureKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate,
      repeat,
    });
  }
}
