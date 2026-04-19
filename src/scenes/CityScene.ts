import Phaser from 'phaser';
import { AK, ANIM, TILE, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import { metaStore } from '../systems/MetaStore';

// Post-death "MIASTO" scene — the meta-progression hub. Built to
// evoke the Tiny Swords reference screenshot: a pair of grass islands
// floating on teal water, ringed by cliff tiles, with buildings,
// villagers wandering between them, sheep grazing, and a signboard
// announcing the town.
//
// Layout is hand-authored (no auto-tile engine): each island is a big
// grass TileSprite with cliff tiles dropped at its perimeter, and
// everything else — buildings, rocks, bushes, NPCs — is placed by
// pixel coordinate. The scene is <200 lines and cheap to re-render.

// Tilemap_color1 frame indices (9 cols × 6 rows). Row/col = index/9.
const T = {
  NW: 0,  N: 1,  NE: 2,
  W:  9,  C: GRASS_CENTER_FRAME, E: 11,
  SW: 18, S: 19, SE: 20,
};

interface BranchSpot {
  id: 'combat' | 'spells' | 'scholar' | 'writer';
  label: string;
  textureKey: string;
  x: number; y: number;
  scale: number;
}

// 4 branch buildings spread across two islands. Anchor-y points the
// sprite's bottom-centre at the ground line.
const BRANCH_SPOTS: BranchSpot[] = [
  { id: 'combat',  label: 'Sala Bojowa',      textureKey: AK.cityCastleRed,
    x: 120, y: 195, scale: 0.55 },
  { id: 'scholar', label: 'Krąg Uczonych',    textureKey: AK.cityBarracksBlue,
    x: 310, y: 220, scale: 0.48 },
  { id: 'spells',  label: 'Biblioteka Magii', textureKey: AK.cityTowerBlue,
    x: 570, y: 200, scale: 0.45 },
  { id: 'writer',  label: 'Gildia Pisarzy',   textureKey: AK.houseBlue3,
    x: 495, y: 230, scale: 0.45 },
];

// Purely decorative buildings (not clickable). Flesh the town out so
// the reference's "cluster of houses + outlying towers" feel comes
// through instead of "4 buildings in a line".
interface DecoBuilding { key: string; x: number; y: number; scale: number }
const DECO_BUILDINGS: DecoBuilding[] = [
  { key: AK.houseYellow1, x: 210, y: 210, scale: 0.42 },
  { key: AK.houseRed1,    x: 420, y: 225, scale: 0.42 },
  { key: AK.houseBlue1,   x: 455, y: 215, scale: 0.38 },
  { key: AK.cityTowerRed, x: 165, y: 320, scale: 0.42 },
];

// Wandering villagers. Each is placed on an island, plays its idle
// animation, and tweens left/right a short distance on a loop.
interface Villager { key: string; anim: string; x: number; y: number; drift: number }
const VILLAGERS: Villager[] = [
  { key: AK.pawnBlack,  anim: ANIM.pawnBlackIdle,  x: 175, y: 225, drift: 20 },
  { key: AK.pawnYellow, anim: ANIM.pawnYellowIdle, x: 265, y: 240, drift: 15 },
  { key: AK.pawnRed,    anim: ANIM.pawnRedIdle,    x: 380, y: 235, drift: 30 },
  { key: AK.pawnPurple, anim: ANIM.pawnPurpleIdle, x: 540, y: 245, drift: 18 },
  { key: AK.pawnBlack,  anim: ANIM.pawnBlackIdle,  x: 140, y: 330, drift: 22 },
];

export class CityScene extends Phaser.Scene {
  constructor() {
    super('City');
  }

  create() {
    this.drawWater();
    // Main island (left + centre) — holds Sala Bojowa, Krąg Uczonych,
    // decorative houses and most villagers.
    this.drawIsland({ x: 16, y: 112, cols: 8, rows: 3 });
    // Small island (right) — the Biblioteka Magii tower cluster.
    this.drawIsland({ x: 512, y: 128, cols: 2, rows: 3 });
    // Bridge tile bridging the two islands so it reads as one town
    // rather than disconnected archipelago chunks.
    this.drawBridge({ fromX: 528, toX: 528, y: 168 });
    // Small outlying tower island in the lower-left of the main area.
    this.drawIsland({ x: 112, y: 272, cols: 2, rows: 2 });

    this.drawWaterDeco();
    this.drawDecoBuildings();
    this.drawBranchBuildings();
    this.drawAmbientLife();
    this.drawTitleBanner();
    this.drawNewRunButton();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.emit('city:closed');
    });
    this.game.events.emit('city:opened', { gold: metaStore.getGold() });
  }

  // ───── backdrop ─────

  private drawWater() {
    this.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0x3fb0be)
      .setOrigin(0, 0)
      .setDepth(0);
  }

  // Render a rectangular grass island with cliff-tile borders. All
  // coords in pixels; `cols` / `rows` are in 64px tiles. Non-tile-
  // aligned sizes are fine — we just overshoot the interior tileSprite
  // to fill any fractional remainder.
  private drawIsland({ x, y, cols, rows }: { x: number; y: number; cols: number; rows: number }) {
    const w = cols * TILE;
    const h = rows * TILE;
    this.add
      .tileSprite(x, y, w, h, AK.tilemap, T.C)
      .setOrigin(0, 0)
      .setDepth(1);

    const left = x - TILE;
    const right = x + w;
    const top = y - TILE;
    const bottom = y + h;
    this.cliff(T.NW, left, top);
    this.cliff(T.NE, right, top);
    this.cliff(T.SW, left, bottom);
    this.cliff(T.SE, right, bottom);
    for (let cx = x; cx < x + w; cx += TILE) {
      this.cliff(T.N, cx, top);
      this.cliff(T.S, cx, bottom);
    }
    for (let cy = y; cy < y + h; cy += TILE) {
      this.cliff(T.W, left, cy);
      this.cliff(T.E, right, cy);
    }
  }

  private cliff(frame: number, x: number, y: number) {
    this.add.image(x, y, AK.tilemap, frame).setOrigin(0, 0).setDepth(2);
  }

  // A couple of extra grass tiles bridging the main island to the
  // tower island so the archipelago reads as a connected town.
  private drawBridge({ fromX, toX, y }: { fromX: number; toX: number; y: number }) {
    // Single-tile-wide stone-grass strip, no fancy cliffs.
    const x = Math.min(fromX, toX) - TILE / 2;
    this.add
      .image(x, y, AK.tilemap, T.C)
      .setOrigin(0, 0)
      .setDepth(1);
    this.add
      .image(x + TILE, y, AK.tilemap, T.C)
      .setOrigin(0, 0)
      .setDepth(1);
  }

  private drawWaterDeco() {
    const spots = [
      { x: 40,  y: 60,  f: 0 },
      { x: 620, y: 70,  f: 2 },
      { x: 80,  y: 330, f: 1 },
      { x: 300, y: 70,  f: 3 },
    ];
    spots.forEach((s) => {
      this.add
        .image(s.x, s.y, AK.cityWaterRocks, s.f)
        .setOrigin(0.5)
        .setScale(0.8)
        .setDepth(0.5);
    });
  }

  // ───── buildings ─────

  private drawDecoBuildings() {
    DECO_BUILDINGS.forEach((b) => {
      this.add
        .image(b.x, b.y, b.key)
        .setOrigin(0.5, 1)
        .setScale(b.scale)
        .setDepth(10);
    });
  }

  private drawBranchBuildings() {
    BRANCH_SPOTS.forEach((spot) => {
      const img = this.add
        .image(spot.x, spot.y, spot.textureKey)
        .setOrigin(0.5, 1)
        .setScale(spot.scale)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });
      img.on('pointerover', () => img.setTint(0xfff0c0));
      img.on('pointerout', () => img.clearTint());
      img.on('pointerdown', () => {
        this.game.events.emit('city:branchClick', { id: spot.id });
      });
      const source = this.textures.get(spot.textureKey).getSourceImage() as HTMLImageElement;
      const topY = spot.y - source.height * spot.scale - 4;
      this.add
        .text(spot.x, topY, spot.label, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#3a2a10',
          backgroundColor: '#f5e8c8',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(11);
    });
  }

  // ───── ambient life ─────

  private drawAmbientLife() {
    // Sheep graze on the main island.
    [ { x: 270, y: 250 }, { x: 450, y: 200 } ].forEach((p) => {
      const sheep = this.add
        .sprite(p.x, p.y, AK.citySheepIdle, 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.35)
        .setDepth(9);
      sheep.play(ANIM.citySheepIdle);
      this.tweens.add({
        targets: sheep,
        x: sheep.x + (Math.random() < 0.5 ? -30 : 30),
        duration: 4000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // Villagers — pawn idle sheets with a slow left-right drift so the
    // town feels populated. Scale 0.28 keeps them knight-sized next to
    // the 64px tiles.
    VILLAGERS.forEach((v) => {
      const spr = this.add
        .sprite(v.x, v.y, v.key, 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.28)
        .setDepth(9);
      spr.play(v.anim);
      this.tweens.add({
        targets: spr,
        x: spr.x + (Math.random() < 0.5 ? -v.drift : v.drift),
        duration: 3200 + Math.random() * 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // Swaying bushes + static rocks sprinkled on the island.
    const deco: Array<{ x: number; y: number; key: string; scale: number; anim?: string }> = [
      { x: 90,  y: 265, key: AK.cityBush,  scale: 0.35, anim: ANIM.cityBushSway },
      { x: 240, y: 175, key: AK.cityBush,  scale: 0.30, anim: ANIM.cityBushSway },
      { x: 380, y: 255, key: AK.cityBush,  scale: 0.32, anim: ANIM.cityBushSway },
      { x: 555, y: 260, key: AK.cityBush,  scale: 0.28, anim: ANIM.cityBushSway },
      { x: 350, y: 170, key: AK.cityRock1, scale: 0.45 },
      { x: 460, y: 260, key: AK.cityRock2, scale: 0.45 },
      { x: 200, y: 335, key: AK.cityRock1, scale: 0.4 },
    ];
    deco.forEach((d) => {
      const spr = this.add
        .sprite(d.x, d.y, d.key, 0)
        .setOrigin(0.5, 1)
        .setScale(d.scale)
        .setDepth(8);
      if (d.anim) spr.play(d.anim);
    });
  }

  // ───── HUD elements ─────

  private drawTitleBanner() {
    this.add
      .rectangle(LOGICAL_WIDTH / 2, 24, 200, 30, 0xf5e8c8, 1)
      .setStrokeStyle(2, 0x3a2a10)
      .setDepth(30);
    this.add
      .text(LOGICAL_WIDTH / 2, 24, 'MIASTO', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#3a2a10',
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.add
      .text(LOGICAL_WIDTH - 16, 24, `⚒ ${metaStore.getGold()}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#a56b12',
        backgroundColor: '#f5e8c8',
        padding: { left: 6, right: 6, top: 2, bottom: 2 },
      })
      .setOrigin(1, 0.5)
      .setDepth(31);
  }

  private drawNewRunButton() {
    const btnX = LOGICAL_WIDTH / 2;
    const btnY = LOGICAL_HEIGHT - 22;
    const bg = this.add
      .rectangle(btnX, btnY, 180, 30, 0xa43d1a, 1)
      .setStrokeStyle(2, 0x3a2a10)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btnX, btnY, 'NOWA PRZYGODA', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31);
    bg.on('pointerover', () => bg.setFillStyle(0xc85020, 1));
    bg.on('pointerout',  () => bg.setFillStyle(0xa43d1a, 1));
    bg.on('pointerdown', () => {
      this.scene.stop('UI');
      this.scene.stop('City');
      this.scene.start('Game');
      this.scene.launch('UI');
    });
  }
}
