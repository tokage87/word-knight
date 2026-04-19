import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { LOGICAL_WIDTH, GROUND_Y } from '../constants/layout';

const MAX_ON_SCREEN = 3;
const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 3000;
const BOSS_EVERY_MS = 30_000;

export class WaveSpawner {
  private timer = 0;
  private interval = MIN_INTERVAL_MS;
  private bossTimer = 0;
  private bossPending = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly group: Phaser.GameObjects.Group,
  ) {
    this.resetInterval();
  }

  update(delta: number) {
    this.bossTimer += delta;
    if (this.bossTimer >= BOSS_EVERY_MS) {
      this.bossTimer -= BOSS_EVERY_MS;
      this.bossPending = true;
    }

    this.timer += delta;
    if (this.timer < this.interval) return;
    this.timer = 0;
    this.resetInterval();
    if (this.group.countActive() >= MAX_ON_SCREEN) return;

    const isBoss = this.bossPending;
    if (isBoss) this.bossPending = false;

    const e = new Enemy(this.scene, LOGICAL_WIDTH + 30, GROUND_Y + 10, {
      isBoss,
    });
    e.setDepth(50);
    this.group.add(e);
    if (isBoss) this.scene.game.events.emit('boss:spawned', e);
  }

  private resetInterval() {
    this.interval =
      MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
  }
}
