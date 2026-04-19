import Phaser from 'phaser';
import SENTENCES_RAW from '../data/sentences.json';

interface SentenceStep {
  correct: string;
  distractor: string;
}

export interface Sentence {
  id: string;
  pl: string;
  steps: SentenceStep[];
}

const SENTENCES: Sentence[] = SENTENCES_RAW as Sentence[];

// Build-the-sentence mini-task. Shown on level-up BEFORE the SkillPicker
// so the player has to translate the Polish prompt word-by-word before
// claiming their reward. W = left option, E = right option (click also
// works). Wrong picks briefly flash red + reveal the correct word, then
// the task auto-advances so the player learns rather than grinds.
export class SentenceBuilder {
  private root?: HTMLElement;
  private current?: Sentence;
  private stepIndex = 0;
  private picked: string[] = [];
  private locked = false;
  private onKeyDown = (ev: KeyboardEvent) => this.handleKey(ev);

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('sentence-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = '';
    root.classList.remove('sentence--visible');

    this.scene.game.events.on('sentence:show', this.show, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('sentence:show', this.show, this);
      window.removeEventListener('keydown', this.onKeyDown);
    });
  }

  static pickRandom(): Sentence {
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  }

  private show(sentence: Sentence) {
    if (!this.root) return;
    this.current = sentence;
    this.stepIndex = 0;
    this.picked = [];
    this.locked = false;
    this.root.classList.add('sentence--visible');
    this.render();
    window.addEventListener('keydown', this.onKeyDown);
  }

  private hide() {
    if (!this.root) return;
    this.root.classList.remove('sentence--visible');
    this.root.innerHTML = '';
    this.current = undefined;
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private render() {
    if (!this.root || !this.current) return;
    const step = this.current.steps[this.stepIndex];
    const optionsInLeftFirst = Math.random() < 0.5;
    const leftWord = optionsInLeftFirst ? step.correct : step.distractor;
    const rightWord = optionsInLeftFirst ? step.distractor : step.correct;

    // Progressive sentence preview: resolved words + blank for the current step.
    const preview = this.current.steps
      .map((_s, i) => {
        if (i < this.stepIndex) return `<span class="sentence-word sentence-word--done">${this.picked[i]}</span>`;
        if (i === this.stepIndex) return `<span class="sentence-word sentence-word--active">____</span>`;
        return `<span class="sentence-word sentence-word--pending">____</span>`;
      })
      .join(' ');

    this.root.innerHTML = `
      <div class="sentence">
        <div class="sentence-kind">TASK</div>
        <div class="sentence-title">Ułóż zdanie</div>
        <div class="sentence-pl">${this.current.pl}</div>
        <div class="sentence-preview">${preview}</div>
        <div class="sentence-grid">
          <button class="sentence-opt" data-key="W" data-word="${leftWord}" type="button">
            <span class="sentence-opt-text">${leftWord}</span>
            <span class="sentence-opt-key">W</span>
          </button>
          <button class="sentence-opt" data-key="E" data-word="${rightWord}" type="button">
            <span class="sentence-opt-text">${rightWord}</span>
            <span class="sentence-opt-key">E</span>
          </button>
        </div>
      </div>
    `;
    this.root.querySelectorAll<HTMLButtonElement>('.sentence-opt').forEach((btn) => {
      btn.addEventListener('click', () => this.pick(btn.dataset.word ?? '', btn));
    });
  }

  private handleKey(ev: KeyboardEvent) {
    if (this.locked || !this.root) return;
    const k = ev.key.toUpperCase();
    if (k !== 'W' && k !== 'E') return;
    ev.preventDefault();
    const btn = this.root.querySelector<HTMLButtonElement>(
      `.sentence-opt[data-key="${k}"]`,
    );
    if (!btn) return;
    this.pick(btn.dataset.word ?? '', btn);
  }

  private pick(word: string, btn: HTMLButtonElement) {
    if (this.locked || !this.current) return;
    const step = this.current.steps[this.stepIndex];
    const correct = word === step.correct;
    this.locked = true;

    if (correct) {
      btn.classList.add('sentence-correct');
      this.picked.push(step.correct);
      this.scene.time.delayedCall(260, () => this.advance());
    } else {
      // Flash wrong, highlight the correct option, then auto-advance so
      // the player sees the right answer.
      btn.classList.add('sentence-wrong');
      this.root!.querySelectorAll<HTMLButtonElement>('.sentence-opt').forEach((b) => {
        if (b.dataset.word === step.correct) b.classList.add('sentence-correct');
      });
      this.picked.push(step.correct);
      this.scene.time.delayedCall(900, () => this.advance());
    }
  }

  private advance() {
    if (!this.current) return;
    this.stepIndex += 1;
    this.locked = false;
    if (this.stepIndex >= this.current.steps.length) {
      this.finish();
      return;
    }
    this.render();
  }

  private finish() {
    const id = this.current?.id;
    this.hide();
    this.scene.game.events.emit('sentence:complete', { id });
  }
}
