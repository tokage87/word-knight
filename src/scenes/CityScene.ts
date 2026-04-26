import Phaser from 'phaser';
import { AK, ANIM, TILE, GRASS_CENTER_FRAME } from '../constants/assetKeys';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import { metaStore } from '../systems/MetaStore';
import { resetSessionUnlocks } from '../systems/CityBranches';
import { CityOverlay } from '../ui/CityOverlay';
import { WritingTask } from '../ui/WritingTask';
import { ListeningTask } from '../ui/ListeningTask';
import { ReadAloudTask } from '../ui/ReadAloudTask';
import { ClozeTask } from '../ui/ClozeTask';

// MIASTO scene — aims to reproduce the Tiny Swords map reference as
// closely as our asset set allows. Key visual beats from that image:
//
//  * Teal water background with rocks floating in it.
//  * A big irregular main island holding a blue castle, soldier NPCs
//    flanking it, pines behind and internal cliff walls carving the
//    interior into little plots.
//  * A cluster of blue houses on a right-hand island with sheep grazing.
//  * A couple of small satellite islands — a tower in the lower-left,
//    another tower on a lone island at the bottom centre.
//  * Pine + leafy (autumn) trees dotting the borders.
//  * A central knight character (we reuse the player sprite).

// Tilemap_color1 indices we actually use. Cols 0-3 rows 0-2 form the
// 3×3 grass+cliff autotile; row 3 of the same cols is the cliff face
// (stone wall). We stack row-2 tiles on top of row-3 tiles to get the
// "thick" 2-tile cliff look the reference uses.
const T = {
  NW: 0,  N: 1,  NE: 2,
  W:  9,  C: GRASS_CENTER_FRAME, E: 11,
  SW: 18, S: 19, SE: 20,
  // Stone wall front, used BELOW south edges to thicken the cliff.
  WALL_W: 27, WALL: 28, WALL_E: 29,
};

interface BranchSpot {
  id: 'combat' | 'spells' | 'scholar' | 'writer';
  label: string;
  textureKey: string;
  x: number; y: number;
  scale: number;
}

// All buildings are the blue Tiny Swords variant so the town reads as
// one faction (matching the reference). Branch identity comes from
// building type (castle / tower / barracks / house) + label.
const BRANCH_SPOTS: BranchSpot[] = [
  { id: 'combat',  label: 'Sala Bojowa',      textureKey: AK.cityCastleBlue,
    x: 130, y: 175, scale: 0.55 },
  { id: 'scholar', label: 'Krąg Uczonych',    textureKey: AK.cityBarracksBlue,
    x: 295, y: 195, scale: 0.48 },
  { id: 'writer',  label: 'Gildia Pisarzy',   textureKey: AK.houseBlue3,
    x: 475, y: 200, scale: 0.45 },
  { id: 'spells',  label: 'Biblioteka Magii', textureKey: AK.cityTowerBlue,
    x: 590, y: 200, scale: 0.42 },
];

// Purely decorative houses — reference has a cluster of 4 blue houses
// in the upper-right, we echo that to the right of the barracks.
interface DecoBuilding { key: string; x: number; y: number; scale: number }
const DECO_BUILDINGS: DecoBuilding[] = [
  { key: AK.houseBlue1, x: 420, y: 200, scale: 0.42 },
  { key: AK.houseBlue2, x: 525, y: 210, scale: 0.42 },
  { key: AK.houseBlue3, x: 540, y: 300, scale: 0.38 },
];

// Soldier-like blue-faction warriors flanking the castle, echoing the
// row of spearmen in the reference. Tweens give them a gentle sway.
interface Soldier { x: number; y: number; drift: number }
const SOLDIERS: Soldier[] = [
  { x: 190, y: 155, drift: 8 },
  { x: 220, y: 160, drift: 8 },
  { x: 250, y: 165, drift: 8 },
  { x: 175, y: 200, drift: 6 },
  { x: 205, y: 200, drift: 6 },
];

// Civilian pawns wandering the streets. Pumped the drift on a couple
// of them so it reads as a patrol/walk rather than a sway-in-place.
interface Villager { key: string; anim: string; x: number; y: number; drift: number }
const VILLAGERS: Villager[] = [
  // Bigger drifts = visible walking. Smaller drifts stay as sway.
  { key: AK.pawnRed,    anim: ANIM.pawnRedIdle,    x: 420, y: 250, drift: 70 },
  { key: AK.pawnPurple, anim: ANIM.pawnPurpleIdle, x: 195, y: 260, drift: 60 },
  { key: AK.pawnBlack,  anim: ANIM.pawnBlackIdle,  x: 555, y: 260, drift: 14 },
  { key: AK.pawnRed,    anim: ANIM.pawnRedIdle,    x: 320, y: 218, drift: 45 },
];

export class CityScene extends Phaser.Scene {
  // Hero sprite stays a class field so the click handler can tween it
  // toward the picked building before opening the overlay. Home spot
  // is the centre point we route him back from when re-entering.
  private hero?: Phaser.GameObjects.Sprite;
  private heroHomeX = 350;
  private heroHomeY = 260;

  constructor() {
    super('City');
  }

  create() {
    // Per-visit gate re-unlock: every time the player enters the city,
    // all four branches are locked again until the gate is re-completed.
    // Tree ranks persist in MetaStore — only the "enter the building"
    // challenge repeats, so visits stay exercising language skills.
    resetSessionUnlocks();
    this.drawWater();

    // Main landmass — occupies roughly the top two-thirds of the view
    // (640×360). Holds the castle + barracks + house + tower, flanked
    // by trees and soldiers.
    this.drawIsland({ x: 32, y: 96, cols: 9, rows: 3 });
    // Bridge strip linking main island to the right-hand extension.
    // (Reference has a narrow grass strip where the map pinches.)
    this.drawLandRow(9 * TILE + 32, 96 + TILE, 1);
    // Right-hand extension with the tower + extra house cluster.
    this.drawIsland({ x: 576, y: 128, cols: 1, rows: 2 });
    // Lower-left satellite island: tower guarded by soldier.
    this.drawIsland({ x: 48, y: 272, cols: 2, rows: 1 });
    // Lower-centre satellite with extra house.
    this.drawIsland({ x: 480, y: 272, cols: 2, rows: 1 });

    this.drawWaterDeco();
    this.drawTrees();
    this.drawDecoBuildings();
    this.drawBranchBuildings();
    this.drawAmbientLife();
    this.drawMarketStall();
    this.drawTitleBanner();
    this.drawParentDashboardButton();
    this.drawNewRunButton();
    this.drawJournalButton();
    this.drawSettingsButton();

    // Phaser's InputPlugin registers a window-level pointerdown listener
    // that hit-tests the canvas regardless of which DOM element the
    // click targeted. Without this guard, clicking a CTA button on e.g.
    // Biblioteka Magii also counts as a click on whichever building
    // sprite sits behind the panel — so the panel instantly re-renders
    // for the wrong branch. We stop propagation on the overlay roots so
    // the event never reaches window.
    ['city-overlay-root', 'writing-task-root'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.phaserGuard === '1') return;
      const stop = (e: Event) => e.stopPropagation();
      el.addEventListener('pointerdown', stop);
      el.addEventListener('mousedown', stop);
      el.addEventListener('touchstart', stop);
      el.dataset.phaserGuard = '1';
    });

    // Branch-detail HTML overlay — listens for city:branchClick and
    // renders a paper panel with the challenge + upgrade scroll.
    const overlay = new CityOverlay(this);
    overlay.mount();
    // Unlock-gate overlays — four task classes all listen on
    // `writing:start` and only render for branches whose gate.kind
    // matches their own. They share #writing-task-root; only one is
    // ever open at a time.
    const writing = new WritingTask(this);
    writing.mount();
    const listening = new ListeningTask(this);
    listening.mount();
    const readAloud = new ReadAloudTask(this);
    readAloud.mount();
    const cloze = new ClozeTask(this);
    cloze.mount();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.emit('city:closed');
      // Wipe every city-side HTML overlay so leaving the city doesn't
      // leak DOM into the next scene.
      ['city-overlay-root', 'writing-task-root'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
      });
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

  // Rectangular grass island with cliff-tile borders AND a thick
  // stone-wall band beneath the south edge (two tiles of wall face)
  // so the cliff reads as substantial rather than paper-thin.
  private drawIsland({ x, y, cols, rows }: { x: number; y: number; cols: number; rows: number }) {
    const w = cols * TILE;
    const h = rows * TILE;
    this.add.tileSprite(x, y, w, h, AK.tilemap, T.C).setOrigin(0, 0).setDepth(1);

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

    // Thick stone wall under the south edge. Row 3 tiles are the cliff
    // face — paint them as a band immediately below each south tile.
    const wallY = bottom + TILE;
    this.cliff(T.WALL_W, left, wallY);
    this.cliff(T.WALL_E, right, wallY);
    for (let cx = x; cx < x + w; cx += TILE) {
      this.cliff(T.WALL, cx, wallY);
    }
  }

  private cliff(frame: number, x: number, y: number) {
    this.add.image(x, y, AK.tilemap, frame).setOrigin(0, 0).setDepth(2);
  }

  // Tiny grass bridge row — no cliff styling, just grass tiles so two
  // islands read as connected.
  private drawLandRow(x: number, y: number, cols: number) {
    for (let i = 0; i < cols; i++) {
      this.add.image(x + i * TILE, y, AK.tilemap, T.C).setOrigin(0, 0).setDepth(1);
    }
  }

  private drawWaterDeco() {
    const spots = [
      { x: 14,  y: 50 },
      { x: 620, y: 60 },
      { x: 80,  y: 340 },
      { x: 260, y: 60 },
      { x: 300, y: 330 },
      { x: 460, y: 50 },
      { x: 550, y: 340 },
    ];
    spots.forEach((s, i) => {
      this.add
        .image(s.x, s.y, AK.cityWaterRocks, i % 4)
        .setOrigin(0.5)
        .setScale(0.6 + (i % 2) * 0.2)
        .setDepth(0.5);
    });
  }

  // ───── trees, buildings, life ─────

  private drawTrees() {
    // Pine trees clustered around the upper-right (mimicking the pine
    // forest behind the Tiny Swords logo in the reference).
    const pines: Array<{ x: number; y: number; scale: number }> = [
      { x: 350, y: 118, scale: 0.28 },
      { x: 395, y: 115, scale: 0.30 },
      { x: 560, y: 125, scale: 0.30 },
      { x: 600, y: 120, scale: 0.26 },
      // Scattered solo pines
      { x: 40,  y: 135, scale: 0.26 },
      { x: 75,  y: 145, scale: 0.28 },
    ];
    pines.forEach((t) => {
      const spr = this.add
        .sprite(t.x, t.y, AK.cityTreePine, 0)
        .setOrigin(0.5, 1)
        .setScale(t.scale)
        .setDepth(7);
      spr.play(ANIM.cityTreePineSway);
    });

    // Leafy (autumn) trees — rounder silhouette, dotted around the
    // border like in the reference.
    const leafy: Array<{ x: number; y: number; scale: number }> = [
      { x: 35,  y: 220, scale: 0.28 },
      { x: 625, y: 260, scale: 0.28 },
      { x: 100, y: 315, scale: 0.26 },
      { x: 440, y: 320, scale: 0.28 },
    ];
    leafy.forEach((t) => {
      const spr = this.add
        .sprite(t.x, t.y, AK.cityTreeLeafy, 0)
        .setOrigin(0.5, 1)
        .setScale(t.scale)
        .setDepth(7);
      spr.play(ANIM.cityTreeLeafySway);
    });
  }

  private drawDecoBuildings() {
    DECO_BUILDINGS.forEach((b) => {
      this.add
        .image(b.x, b.y, b.key)
        .setOrigin(0.5, 1)
        .setScale(b.scale)
        .setDepth(10);
    });
  }

  // Tween the hero sprite horizontally toward `targetX`, then call
  // `onArrive`. Distance scales the duration so close buildings feel
  // snappy and far ones still feel deliberate. Falls back to firing
  // the callback immediately if the hero hasn't been spawned yet.
  private walkHeroTo(targetX: number, onArrive: () => void) {
    if (!this.hero) {
      onArrive();
      return;
    }
    const dx = targetX - this.hero.x;
    if (Math.abs(dx) < 4) {
      onArrive();
      return;
    }
    this.hero.setFlipX(dx < 0);
    this.tweens.killTweensOf(this.hero);
    this.tweens.add({
      targets: this.hero,
      x: targetX,
      duration: Math.min(900, 250 + Math.abs(dx) * 2),
      ease: 'Sine.InOut',
      onComplete: () => onArrive(),
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
        this.walkHeroTo(spot.x, () => {
          this.game.events.emit('city:branchClick', { id: spot.id });
        });
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

  private drawAmbientLife() {
    // Soldier guards (Tiny Swords Blue Warrior idle) stationed around
    // the castle — the row of spearmen in the reference.
    SOLDIERS.forEach((s) => {
      const spr = this.add
        .sprite(s.x, s.y, AK.citySoldierIdle, 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.28)
        .setDepth(9);
      spr.play(ANIM.citySoldierIdle);
      this.tweens.add({
        targets: spr,
        x: spr.x + (Math.random() < 0.5 ? -s.drift : s.drift),
        duration: 3800 + Math.random() * 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // Civilian pawns.
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

    // "Player knight" standing in the centre of town, idling — echoes
    // the single shield-and-sword hero in the middle of the reference.
    // Stored on the scene so click handlers can walk him toward the
    // building the player just picked.
    const hero = this.add
      .sprite(this.heroHomeX, this.heroHomeY, AK.knightIdle, 0)
      .setOrigin(0.5, 0.72)
      .setScale(0.32)
      .setDepth(9);
    hero.play(ANIM.knightIdle);
    this.hero = hero;

    // Sheep grazing near the house cluster (reference shows 3-4 sheep).
    const sheepSpots = [
      { x: 395, y: 270 }, { x: 500, y: 270 }, { x: 570, y: 270 }, { x: 520, y: 340 },
    ];
    sheepSpots.forEach((p) => {
      const sheep = this.add
        .sprite(p.x, p.y, AK.citySheepIdle, 0)
        .setOrigin(0.5, 0.72)
        .setScale(0.30)
        .setDepth(9);
      sheep.play(ANIM.citySheepIdle);
      this.tweens.add({
        targets: sheep,
        x: sheep.x + (Math.random() < 0.5 ? -18 : 18),
        duration: 4200 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // Swaying bushes and static rocks sprinkled on every island.
    const deco: Array<{ x: number; y: number; key: string; scale: number; anim?: string }> = [
      { x: 120, y: 260, key: AK.cityBush,  scale: 0.30, anim: ANIM.cityBushSway },
      { x: 330, y: 180, key: AK.cityBush,  scale: 0.26, anim: ANIM.cityBushSway },
      { x: 390, y: 260, key: AK.cityBush,  scale: 0.30, anim: ANIM.cityBushSway },
      { x: 440, y: 170, key: AK.cityBush,  scale: 0.26, anim: ANIM.cityBushSway },
      { x: 280, y: 260, key: AK.cityRock1, scale: 0.45 },
      { x: 170, y: 175, key: AK.cityRock2, scale: 0.40 },
      { x: 480, y: 170, key: AK.cityRock1, scale: 0.40 },
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

  // Market stall — placeholder vendor at a fixed plaza spot. Yellow
  // pawn stands behind a small wooden plank (a pair of stacked rocks
  // serves as the counter — Tiny Swords has no stall asset). Label
  // floats above. Click → city:stallClick so CityOverlay can pop a
  // "shop coming soon" notice with the player's persistent gold.
  private drawMarketStall() {
    const sx = 360;
    const sy = 218;

    // Stacked rocks as a make-do counter.
    this.add
      .image(sx - 8, sy - 2, AK.cityRock1)
      .setOrigin(0.5, 1)
      .setScale(0.32)
      .setDepth(8);
    this.add
      .image(sx + 8, sy - 2, AK.cityRock2)
      .setOrigin(0.5, 1)
      .setScale(0.30)
      .setDepth(8);

    // Vendor pawn.
    const vendor = this.add
      .sprite(sx, sy - 4, AK.pawnYellow, 0)
      .setOrigin(0.5, 0.72)
      .setScale(0.28)
      .setDepth(9);
    vendor.play(ANIM.pawnYellowIdle);

    // Label above the stall.
    this.add
      .text(sx, sy - 30, '🪙 Targowisko', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#3a2a10',
        backgroundColor: '#f5e8c8',
        padding: { left: 4, right: 4, top: 1, bottom: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(11);

    // Hit-zone covering vendor + counter so the kid doesn't have to
    // pixel-target the pawn itself. Reuses the same walk-then-emit
    // flow as branch buildings.
    const hit = this.add
      .zone(sx, sy - 12, 44, 30)
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.walkHeroTo(sx, () => {
        this.game.events.emit('city:stallClick');
      });
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

  // Secondary button that opens the parent/teacher journal — a list
  // of every writing submission the student has made. Lives to the
  // right of NOWA PRZYGODA so parents can skim without interrupting
  // the kid's run flow.
  private drawJournalButton() {
    const btnX = LOGICAL_WIDTH - 58;
    const btnY = LOGICAL_HEIGHT - 22;
    const bg = this.add
      .rectangle(btnX, btnY, 100, 30, 0x3a6fa6, 1)
      .setStrokeStyle(2, 0x1e3a57)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btnX, btnY, 'DZIENNIK', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31);
    bg.on('pointerover', () => bg.setFillStyle(0x5a90c5, 1));
    bg.on('pointerout',  () => bg.setFillStyle(0x3a6fa6, 1));
    bg.on('pointerdown', () => {
      this.game.events.emit('city:openJournal');
    });
  }

  // Quaternary button — opens the parent dashboard (weekly bars,
  // streak, words mastered, total play time). Sits between the
  // settings button on the left and the NOWA PRZYGODA centre button.
  private drawParentDashboardButton() {
    const btnX = 170;
    const btnY = LOGICAL_HEIGHT - 22;
    const bg = this.add
      .rectangle(btnX, btnY, 110, 30, 0x6b3e7a, 1)
      .setStrokeStyle(2, 0x3a1f48)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btnX, btnY, 'DLA RODZICA', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31);
    bg.on('pointerover', () => bg.setFillStyle(0x8a5a99, 1));
    bg.on('pointerout',  () => bg.setFillStyle(0x6b3e7a, 1));
    bg.on('pointerdown', () => {
      this.game.events.emit('city:openParentDashboard');
    });
  }

  // Tertiary button — opens the curriculum picker so the parent can
  // choose source (legacy / tiered / A2 / B1) + tier + category. Kept
  // small and gray so it reads as a settings affordance, not a primary
  // action.
  private drawSettingsButton() {
    const btnX = 60;
    const btnY = LOGICAL_HEIGHT - 22;
    const bg = this.add
      .rectangle(btnX, btnY, 100, 30, 0x5a5a5a, 1)
      .setStrokeStyle(2, 0x2c2c2c)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btnX, btnY, 'USTAWIENIA', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31);
    bg.on('pointerover', () => bg.setFillStyle(0x7a7a7a, 1));
    bg.on('pointerout',  () => bg.setFillStyle(0x5a5a5a, 1));
    bg.on('pointerdown', () => {
      this.game.events.emit('city:openCurriculum');
    });
  }
}
