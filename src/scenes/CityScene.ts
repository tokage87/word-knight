import Phaser from 'phaser';
import { AK } from '../constants/assetKeys';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants/layout';
import { metaStore } from '../systems/MetaStore';

// Post-death city ("MIASTO") — the meta-progression hub.
//
// v1 is a stub: a single peaceful scene showing the buildings we have
// art for, a gold counter, and a "NOWA PRZYGODA" button that kicks
// off a fresh run. Branch unlock logic, upgrade scrolls and settings
// land in later phases; right now the scene just proves the flow
// (Game Over → visit City → start new run).
//
// Layout note: we don't have a proper isometric tileset, so we fake a
// 3/4 town view by staggering the Tiny Swords building sprites along
// a slight diagonal and adding a soft grass + mountain backdrop so it
// feels like a different "place" than the combat scene.
export class CityScene extends Phaser.Scene {
  constructor() {
    super('City');
  }

  create() {
    // Pastel sky + grass background so the city reads as peaceful.
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0xc0e0ff, 0xc0e0ff, 0xfff0d8, 0xfff0d8, 1);
    sky.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const grass = this.add.graphics().setDepth(1);
    grass.fillStyle(0x6fba3a, 1);
    grass.fillRect(0, LOGICAL_HEIGHT - 130, LOGICAL_WIDTH, 130);

    // Title banner
    this.add
      .text(LOGICAL_WIDTH / 2, 20, 'MIASTO', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#3a2a10',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    // Four buildings, one per branch. Images sit on a shared ground
    // line (y = LOGICAL_HEIGHT - 110) staggered slightly in x so they
    // don't overlap. Labels float above each — we'll swap to a proper
    // interactive panel + challenge UI in Phase 3+.
    const buildings: Array<{ x: number; key: string; label: string; id: string }> = [
      { x: 110, key: AK.houseRed1,    label: 'Sala Bojowa',     id: 'combat' },
      { x: 250, key: AK.houseBlue1,   label: 'Biblioteka Magii', id: 'spells' },
      { x: 390, key: AK.houseYellow1, label: 'Krąg Uczonych',    id: 'scholar' },
      { x: 530, key: AK.houseBlue2,   label: 'Gildia Pisarzy',   id: 'writer' },
    ];
    buildings.forEach((b) => {
      const img = this.add
        .image(b.x, LOGICAL_HEIGHT - 110, b.key)
        .setOrigin(0.5, 1)
        .setScale(0.6)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => {
        this.game.events.emit('city:branchClick', { id: b.id });
      });
      this.add
        .text(b.x, LOGICAL_HEIGHT - 200, b.label, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#3a2a10',
          backgroundColor: '#f5e8c8',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(10);
    });

    // Emit a scene-ready event so the UI overlay (HTML) can render
    // the persistent top bar (gold, "NOWA PRZYGODA", settings). For
    // v1 we just rely on the HUD's existing city overlay, managed in
    // UIScene (next phase).
    this.game.events.emit('city:opened', {
      gold: metaStore.getGold(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.emit('city:closed');
    });

    // Temporary: a big "NOWA PRZYGODA" rectangle button, drawn in
    // Phaser until we wire a proper HTML overlay. Confirms the flow
    // from Game Over → City → fresh Game.
    const btnX = LOGICAL_WIDTH / 2;
    const btnY = LOGICAL_HEIGHT - 24;
    const btnBg = this.add
      .rectangle(btnX, btnY, 160, 28, 0xa43d1a, 1)
      .setStrokeStyle(2, 0x3a2a10)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btnX, btnY, 'NOWA PRZYGODA', {
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(21);
    btnBg.on('pointerdown', () => {
      // Reboot the Game + UI scenes from the city.
      this.scene.stop('UI');
      this.scene.stop('City');
      this.scene.start('Game');
      this.scene.launch('UI');
    });
  }
}
