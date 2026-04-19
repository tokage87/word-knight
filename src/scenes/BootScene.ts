import Phaser from 'phaser';
import { AK, ANIM, UNIT_FRAME, TILE } from '../constants/assetKeys';

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

    // Enemy (Tiny Swords Skull)
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
  }

  create() {
    this.buildAnim(ANIM.knightIdle, AK.knightIdle, 8, 8, -1);
    this.buildAnim(ANIM.knightRun, AK.knightRun, 6, 12, -1);
    this.buildAnim(ANIM.knightAttack, AK.knightAttack, 4, 14, 0);
    // Skull: idle 8f, run 6f, attack 7f
    this.buildAnim(ANIM.enemyIdle, AK.enemyIdle, 8, 7, -1);
    this.buildAnim(ANIM.enemyRun, AK.enemyRun, 6, 11, -1);
    this.buildAnim(ANIM.enemyAttack, AK.enemyAttack, 7, 14, 0);

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
