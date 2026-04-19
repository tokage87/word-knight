import Phaser from 'phaser';
import { AK, ANIM, TILE, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import { metaStore } from '../systems/MetaStore';

// Post-death "MIASTO" — the meta-progression hub. Goal of this scene
// is to feel like the Tiny Swords reference screenshot: a top-down
// island floating on teal water, ringed by cliff tiles, dotted with
// buildings, sheep, bushes and trees. The branch buildings are
// clickable; a "NOWA PRZYGODA" button restarts the run loop.
//
// We don't have a full auto-tiled map editor, so the island is drawn
// by hand: a grass TileSprite for the interior, hand-placed cliff
// tiles from Tilemap_color1 for the edges, and sprites on top for
// buildings, rocks, bushes and a couple of sheep for ambient life.

// Tilemap_color1 layout (9 cols × 6 rows of 64px tiles):
//   rows 0-2 cols 0-2 = grass+cliff corner/edge autotile (a 3×3 box
//                        where (1,1) is pure grass center)
// All indices here are `row*9 + col` against that sheet, which is what
// Phaser's generateFrameNumbers / setFrame expects for a spritesheet.
const T = {
  NW: 0 * 9 + 0,  N: 0 * 9 + 1,  NE: 0 * 9 + 2,
  W:  1 * 9 + 0,  C: GRASS_CENTER_FRAME, E:  1 * 9 + 2,
  SW: 2 * 9 + 0,  S: 2 * 9 + 1,  SE: 2 * 9 + 2,
};

// One entry per branch building. Position is the sprite's bottom-
// centre on the island, in pixels. `label` is the Polish caption that
// floats above; `id` matches MetaStore branch ids.
interface BranchSpot {
  id: 'combat' | 'spells' | 'scholar' | 'writer';
  label: string;
  textureKey: string;
  x: number; y: number;
  scale: number;
}

const BRANCH_SPOTS: BranchSpot[] = [
  // Sala Bojowa — the red castle anchors the top-left, matching the
  // reference layout where the fortress dominates that corner.
  { id: 'combat',  label: 'Sala Bojowa',     textureKey: AK.cityCastleRed,
    x: 130, y: 155, scale: 0.45 },
  // Biblioteka Magii — a purple tower (wizard vibe) on the left.
  { id: 'spells',  label: 'Biblioteka Magii', textureKey: AK.cityTowerBlue,
    x: 235, y: 200, scale: 0.40 },
  // Krąg Uczonych — yellow castle (warm / scholarly) in the middle.
  { id: 'scholar', label: 'Krąg Uczonych',    textureKey: AK.cityBarracksBlue,
    x: 385, y: 225, scale: 0.42 },
  // Gildia Pisarzy — a blue house cluster on the right.
  { id: 'writer',  label: 'Gildia Pisarzy',   textureKey: AK.houseBlue3,
    x: 520, y: 220, scale: 0.45 },
];

export class CityScene extends Phaser.Scene {
  constructor() {
    super('City');
  }

  create() {
    this.drawWater();
    this.drawIsland();
    this.drawWaterRocks();
    this.drawBuildings();
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
    // Solid teal wash. The Tiny Swords water tile is 64×64 of the same
    // colour so a rect is indistinguishable and far cheaper than a
    // tileSprite. We'll overlay foam-like shimmer with a second layer
    // if we ever animate it; for now a flat sea is fine and reads
    // clearly as "different place from the combat scene".
    this.add
      .rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0x3fb0be)
      .setOrigin(0, 0)
      .setDepth(0);
  }

  private drawIsland() {
    // Island footprint in tile coordinates (10 cols × ~5 rows of 64px
    // won't fit at logical res, so we work in 32px half-tiles: the
    // tilemap frames render at 64px but positioned at arbitrary xs so
    // the visible island covers most of the canvas).
    //
    // To keep code compact we render the island as a big grass
    // TileSprite with cliff tiles hand-placed around the perimeter.
    // This isn't pixel-perfect autotile output, but at the display
    // scale it reads correctly as "grass island with stone edges".

    // Interior grass — one big tileSprite covering the island rect.
    const islandX = 32;
    const islandY = 96;
    const islandW = LOGICAL_WIDTH - 64;   // 576 px
    const islandH = LOGICAL_HEIGHT - 160; // 200 px
    this.add
      .tileSprite(islandX, islandY, islandW, islandH, AK.tilemap, T.C)
      .setOrigin(0, 0)
      .setDepth(1);

    // Cliff border. Each tile is drawn as a separate image at 64×64
    // and tiled along the edge. We downscale the tile sheet's frames
    // inline via Phaser.Sprite scaleX/Y — leaving scale 1 for crisp
    // pixel art.
    const topY = islandY - TILE;
    const bottomY = islandY + islandH;
    const leftX = islandX - TILE;
    const rightX = islandX + islandW;

    // North edge
    this.cliff(T.NW, leftX, topY);
    for (let x = islandX; x < islandX + islandW; x += TILE) this.cliff(T.N, x, topY);
    this.cliff(T.NE, rightX, topY);
    // South edge
    this.cliff(T.SW, leftX, bottomY);
    for (let x = islandX; x < islandX + islandW; x += TILE) this.cliff(T.S, x, bottomY);
    this.cliff(T.SE, rightX, bottomY);
    // West + East edges
    for (let y = islandY; y < islandY + islandH; y += TILE) {
      this.cliff(T.W, leftX, y);
      this.cliff(T.E, rightX, y);
    }
  }

  private cliff(frame: number, x: number, y: number) {
    this.add
      .image(x, y, AK.tilemap, frame)
      .setOrigin(0, 0)
      .setDepth(2);
  }

  private drawWaterRocks() {
    // A handful of rocks in the water to break up the empty teal.
    // Water-rocks sheet has multiple frames; we pick a couple.
    const positions = [
      { x: 40,  y: 60,  f: 0 },
      { x: 600, y: 70,  f: 2 },
      { x: 80,  y: 320, f: 1 },
      { x: 560, y: 330, f: 3 },
    ];
    positions.forEach((p) => {
      this.add
        .image(p.x, p.y, AK.cityWaterRocks, p.f)
        .setOrigin(0.5, 0.5)
        .setDepth(0.5)
        .setScale(0.8);
    });
  }

  // ───── buildings ─────

  private drawBuildings() {
    BRANCH_SPOTS.forEach((spot) => {
      const img = this.add
        .image(spot.x, spot.y, spot.textureKey)
        .setOrigin(0.5, 1)        // anchor bottom-centre on the ground
        .setScale(spot.scale)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });
      img.on('pointerover', () => img.setTint(0xfff0c0));
      img.on('pointerout', () => img.clearTint());
      img.on('pointerdown', () => {
        this.game.events.emit('city:branchClick', { id: spot.id });
      });
      // Floating paper label just above the building.
      this.add
        .text(spot.x, spot.y - spot.scale * this.textures.get(spot.textureKey).getSourceImage().height - 6, spot.label, {
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
    // Two sheep wander-idle on different grass patches.
    [ { x: 310, y: 260 }, { x: 450, y: 175 } ].forEach((p) => {
      const sheep = this.add
        .sprite(p.x, p.y, AK.citySheepIdle, 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.35)
        .setDepth(9);
      sheep.play(ANIM.citySheepIdle);
      // Slight horizontal drift, clamped, so sheep feel alive without
      // wandering off the island.
      this.tweens.add({
        targets: sheep,
        x: sheep.x + (Math.random() < 0.5 ? -30 : 30),
        duration: 4000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // Scattered bushes and rocks for texture. Bushes animate (16 frames).
    const deco: Array<{ x: number; y: number; key: string; scale: number; anim?: string }> = [
      { x: 100, y: 265, key: AK.cityBush,  scale: 0.5, anim: ANIM.cityBushSway },
      { x: 575, y: 160, key: AK.cityBush,  scale: 0.5, anim: ANIM.cityBushSway },
      { x: 350, y: 135, key: AK.cityRock1, scale: 0.5 },
      { x: 270, y: 290, key: AK.cityRock2, scale: 0.5 },
      { x: 60,  y: 200, key: AK.cityBush,  scale: 0.45, anim: ANIM.cityBushSway },
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

  // ───── HUD elements on the scene ─────

  private drawTitleBanner() {
    // A simple paper rectangle with the town title. A proper wooden
    // signpost (like the reference) would be nicer — we can swap in
    // the ribbon / banner assets later for polish.
    const banner = this.add
      .rectangle(LOGICAL_WIDTH / 2, 24, 200, 30, 0xf5e8c8, 1)
      .setStrokeStyle(2, 0x3a2a10)
      .setDepth(30);
    void banner;
    this.add
      .text(LOGICAL_WIDTH / 2, 24, 'MIASTO', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#3a2a10',
      })
      .setOrigin(0.5)
      .setDepth(31);

    // Gold counter next to title (persists across runs via MetaStore).
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
    // Prominent red button at bottom-centre: leaving town kicks off
    // a fresh Game + UI pair. Stays a Phaser rect for v1; when the
    // branch-detail HTML overlay lands we can promote this too.
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
