import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './constants/layout';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import './styles/hud.css';
import './styles/quiz.css';
import './styles/skillpicker.css';
import './styles/sentences.css';

(window as unknown as { __game: unknown }).__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  backgroundColor: '#0b0e1a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene, UIScene],
});
