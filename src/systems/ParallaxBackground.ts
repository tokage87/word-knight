import Phaser from 'phaser';
import { AK, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, GROUND_Y } from '../constants/layout';

interface Villager {
  sprite: Phaser.GameObjects.Sprite;
  baseScrollFactor: number;
}

interface ParallaxSprite {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  scrollFactor: number;
  wrapWidth: number;
}

// Visual background for the run scene: sky gradient, mountain layers,
// drifting clouds, mid-band houses/trees, villager crowd, foreground
// bushes and the scrolling ground strip.
//
// GameScene constructs a FRESH instance every create() — that makes the
// restart-reset semantics trivially correct by construction: the sprite
// arrays start empty on every run, so stale entries can never keep
// destroyed sprites alive in the per-frame scroll loop while the arrays
// grow without bound.
export class ParallaxBackground {
  private ground!: Phaser.GameObjects.TileSprite;

  private skyGradient!: Phaser.GameObjects.Graphics;
  private clouds: ParallaxSprite[] = [];
  private mountains!: Phaser.GameObjects.Graphics;
  private midProps: ParallaxSprite[] = [];
  private villagers: Villager[] = [];
  private bushes: ParallaxSprite[] = [];

  private lastBgScroll = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  create() {
    this.drawSky();
    this.drawMountains();
    this.spawnClouds();

    // Ground tile top sits a few px above GROUND_Y so the pale bottom
    // of the sky gradient is hidden behind the grass and characters
    // visually embed into the grass instead of floating above a
    // near-white seam.
    const GROUND_OVERLAP = 4;
    this.ground = this.scene.add
      .tileSprite(
        0,
        GROUND_Y - GROUND_OVERLAP,
        LOGICAL_WIDTH,
        LOGICAL_HEIGHT - GROUND_Y + GROUND_OVERLAP,
        AK.tilemap,
        GRASS_CENTER_FRAME,
      )
      .setOrigin(0, 0)
      .setDepth(10);

    this.spawnMidProps();
    this.spawnVillagerCrowd();
    this.spawnBushes();
  }

  private drawSky() {
    this.skyGradient = this.scene.add.graphics();
    const colors = [
      Phaser.Display.Color.HexStringToColor('#8ec6ff').color,
      Phaser.Display.Color.HexStringToColor('#c8eaff').color,
      Phaser.Display.Color.HexStringToColor('#e8f4ff').color,
    ];
    this.skyGradient.fillGradientStyle(
      colors[0],
      colors[0],
      colors[2],
      colors[2],
      1,
    );
    this.skyGradient.fillRect(0, 0, LOGICAL_WIDTH, GROUND_Y);
  }

  private drawMountains() {
    this.mountains = this.scene.add.graphics();
    this.mountains.fillStyle(0x7a8aa5, 0.85);
    const baseY = GROUND_Y - 6;
    this.mountains.beginPath();
    this.mountains.moveTo(-20, baseY);
    const peaks = [40, 110, 190, 260, 330, 410, 490, 560, 630];
    const heights = [60, 45, 72, 50, 80, 55, 68, 40, 62];
    peaks.forEach((x, i) => {
      this.mountains.lineTo(x, baseY - heights[i]);
      this.mountains.lineTo(x + 40, baseY - 10);
    });
    this.mountains.lineTo(LOGICAL_WIDTH + 20, baseY);
    this.mountains.closePath();
    this.mountains.fillPath();

    this.mountains.fillStyle(0x556a82, 0.85);
    this.mountains.beginPath();
    this.mountains.moveTo(-20, baseY);
    const peaks2 = [0, 80, 160, 240, 320, 400, 480, 560, 640];
    const heights2 = [40, 55, 42, 70, 38, 62, 44, 58, 46];
    peaks2.forEach((x, i) => {
      this.mountains.lineTo(x, baseY - heights2[i]);
      this.mountains.lineTo(x + 30, baseY - 8);
    });
    this.mountains.lineTo(LOGICAL_WIDTH + 20, baseY);
    this.mountains.closePath();
    this.mountains.fillPath();
  }

  private spawnClouds() {
    const cloudKeys = [AK.cloud1, AK.cloud2, AK.cloud3];
    const positions = [
      { x: 80, y: 40, scale: 0.14 },
      { x: 260, y: 24, scale: 0.16 },
      { x: 440, y: 48, scale: 0.13 },
      { x: 560, y: 28, scale: 0.15 },
    ];
    positions.forEach((p, i) => {
      const sprite = this.scene.add
        .image(p.x, p.y, cloudKeys[i % cloudKeys.length])
        .setOrigin(0.5, 0.5)
        .setScale(p.scale)
        .setAlpha(0.9);
      this.clouds.push({ sprite, scrollFactor: 0.02, wrapWidth: LOGICAL_WIDTH + 200 });
    });
  }

  private spawnMidProps() {
    // Houses + trees along the middle parallax band. Spawned across two
    // copies of the visible strip (x=[0..2*LOGICAL_WIDTH]) so that as
    // the first copy scrolls left the second copy already fills the
    // right side — no empty right edge while waiting for a wrap.
    const base: Array<{ key: string; x: number; scale: number; depth: number }> = [
      { key: AK.houseBlue1, x: 40, scale: 0.42, depth: 15 },
      { key: AK.houseYellow1, x: 210, scale: 0.38, depth: 15 },
      { key: AK.houseRed1, x: 300, scale: 0.44, depth: 15 },
      { key: AK.tree, x: 360, scale: 0.30, depth: 16 },
      { key: AK.houseBlue2, x: 430, scale: 0.40, depth: 15 },
      { key: AK.houseYellow1, x: 520, scale: 0.38, depth: 15 },
      { key: AK.tree, x: 590, scale: 0.26, depth: 16 },
      { key: AK.houseBlue1, x: 640, scale: 0.42, depth: 15 },
    ];
    const props = [...base, ...base.map((p) => ({ ...p, x: p.x + LOGICAL_WIDTH }))];
    const wrapWidth = LOGICAL_WIDTH * 2;
    props.forEach((p) => {
      const originY = p.key === AK.tree ? 0.938 : 0.90;
      const sprite =
        p.key === AK.tree
          ? this.scene.add
              .sprite(p.x, GROUND_Y, p.key, 0)
              .setOrigin(0.5, originY)
              .setScale(p.scale)
          : this.scene.add
              .image(p.x, GROUND_Y, p.key)
              .setOrigin(0.5, originY)
              .setScale(p.scale);
      sprite.setDepth(p.depth);
      this.midProps.push({ sprite, scrollFactor: 0.4, wrapWidth });
    });
  }

  private spawnVillagerCrowd() {
    // Spawn across 2*LOGICAL_WIDTH so the right side stays populated
    // during parallax scroll (matches wrapWidth = 2*LOGICAL_WIDTH).
    const keys = [AK.pawnBlack, AK.pawnPurple, AK.pawnYellow, AK.pawnRed];
    const count = 28;
    const scale = 0.20;
    for (let i = 0; i < count; i++) {
      const x = 20 + i * 45 + Math.random() * 14;
      const key = keys[Math.floor(Math.random() * keys.length)];
      const sprite = this.scene.add
        .sprite(x, GROUND_Y, key, 0)
        .setOrigin(0.5, 0.71)
        .setScale(scale)
        .setDepth(20);
      if (Math.random() < 0.5) sprite.setFlipX(true);
      this.villagers.push({ sprite, baseScrollFactor: 0.55 });
    }
  }

  private spawnBushes() {
    const base = [
      { x: 20, scale: 0.38 },
      { x: 250, scale: 0.34 },
      { x: 480, scale: 0.40 },
      { x: 600, scale: 0.34 },
    ];
    const positions = [...base, ...base.map((p) => ({ ...p, x: p.x + LOGICAL_WIDTH }))];
    const wrapWidth = LOGICAL_WIDTH * 2;
    // bush.png has its painted leaves ending at y=78/128 (ratio 0.609) —
    // the rest of the frame is transparent padding. Use that ratio as
    // origin Y so the bush visually sits on GROUND_Y.
    positions.forEach((p) => {
      const sprite = this.scene.add
        .sprite(p.x, GROUND_Y + 2, AK.bush, 0)
        .setOrigin(0.5, 0.609)
        .setScale(p.scale)
        .setDepth(30);
      this.bushes.push({ sprite, scrollFactor: 0.85, wrapWidth });
    });
  }

  scroll(delta: number) {
    this.lastBgScroll += delta;
    const px = delta * 0.04;

    this.ground.tilePositionX += px * 1.2;
    this.clouds.forEach((c) => this.driftSprite(c, px));
    this.midProps.forEach((c) => this.driftSprite(c, px));
    this.villagers.forEach((v) =>
      this.driftSprite(
        { sprite: v.sprite, scrollFactor: v.baseScrollFactor, wrapWidth: LOGICAL_WIDTH * 2 },
        px,
      ),
    );
    this.bushes.forEach((b) => this.driftSprite(b, px));
  }

  private driftSprite(p: ParallaxSprite, px: number) {
    p.sprite.x -= px * p.scrollFactor;
    if (p.sprite.x < -p.wrapWidth * 0.3) {
      p.sprite.x += p.wrapWidth;
    }
  }
}
