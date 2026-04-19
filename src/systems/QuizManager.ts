import Phaser from 'phaser';
import VOCAB_RAW from '../data/vocab.json';

interface VocabEntry {
  id: string;
  pl: string;
  en: string;
  distractors: string[];
}

const VOCAB: VocabEntry[] = VOCAB_RAW as VocabEntry[];

type KeyCode = 'W' | 'E';

// Compact 2-option quiz in the bottom-right. W = left button, E = right button.
// Click is supported as a fallback, but keyboard is the primary input path.
export class QuizManager {
  private current?: VocabEntry;
  private root?: HTMLElement;
  private locked = false;
  private inputPaused = false;
  private keydownHandler?: (ev: KeyboardEvent) => void;

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('quiz-root');
    if (!root) return;

    // Freeze quiz input while the SentenceBuilder / SkillPicker modals
    // are up; otherwise W/E would answer multiple things at once. The
    // story gate reuses the sentence UI but emits a different event, so
    // it needs its own pause trigger — otherwise W/E would register
    // both as a story pick AND a quiz answer.
    this.scene.game.events.on('sentence:show', () => {
      this.inputPaused = true;
    });
    this.scene.game.events.on('story:show', () => {
      this.inputPaused = true;
    });
    this.scene.game.events.on('skillpicker:show', () => {
      this.inputPaused = true;
    });
    this.scene.game.events.on('skillpicker:picked', () => {
      this.inputPaused = false;
    });
    root.innerHTML = `
      <div class="quiz">
        <div class="quiz-prompt">Przetłumacz</div>
        <div class="quiz-word"></div>
        <div class="quiz-grid">
          <button class="quiz-opt" data-key="W" data-idx="0" type="button">
            <span class="quiz-opt-text"></span>
            <span class="quiz-opt-key">W</span>
          </button>
          <button class="quiz-opt" data-key="E" data-idx="1" type="button">
            <span class="quiz-opt-text"></span>
            <span class="quiz-opt-key">E</span>
          </button>
        </div>
      </div>
    `;
    this.root = root;

    root.addEventListener('click', (ev) => this.onClick(ev));

    this.keydownHandler = (ev: KeyboardEvent) => {
      const k = ev.key.toUpperCase();
      if (k === 'W' || k === 'E') {
        ev.preventDefault();
        this.pressKey(k);
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keydownHandler) {
        window.removeEventListener('keydown', this.keydownHandler);
      }
    });

    this.loadNext();
  }

  private onClick(ev: Event) {
    if (this.locked || this.inputPaused) return;
    const t = (ev.target as HTMLElement).closest(
      '.quiz-opt',
    ) as HTMLButtonElement | null;
    if (!t) return;
    const idx = Number(t.dataset.idx);
    this.answer(idx, t);
  }

  private pressKey(key: KeyCode) {
    if (this.locked || this.inputPaused || !this.root) return;
    const btn = this.root.querySelector<HTMLButtonElement>(
      `.quiz-opt[data-key="${key}"]`,
    );
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    this.answer(idx, btn);
  }

  private answer(idx: number, btn: HTMLButtonElement) {
    if (!this.current || !this.root) return;
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('.quiz-opt');
    const chosen = buttons[idx]
      .querySelector<HTMLElement>('.quiz-opt-text')
      ?.textContent?.trim();
    const isCorrect = chosen === this.current.en;

    this.locked = true;

    if (isCorrect) {
      btn.classList.add('quiz-correct');
      this.scene.game.events.emit('quiz:correct', { id: this.current.id });
      this.scene.time.delayedCall(400, () => this.loadNext());
    } else {
      btn.classList.add('quiz-wrong');
      this.scene.game.events.emit('quiz:wrong', { id: this.current.id });
      buttons.forEach((b) => {
        const t = b.querySelector<HTMLElement>('.quiz-opt-text');
        if (t?.textContent?.trim() === this.current!.en) {
          b.classList.add('quiz-correct');
        }
      });
      this.scene.time.delayedCall(1200, () => this.loadNext());
    }
  }

  private loadNext() {
    if (!this.root) return;
    this.current = VOCAB[Math.floor(Math.random() * VOCAB.length)];
    const distractor =
      this.current.distractors[
        Math.floor(Math.random() * this.current.distractors.length)
      ];
    const opts = [this.current.en, distractor];
    if (Math.random() < 0.5) opts.reverse();

    const wordEl = this.root.querySelector('.quiz-word');
    if (wordEl) wordEl.textContent = this.current.pl.toUpperCase();

    const buttons = this.root.querySelectorAll<HTMLButtonElement>('.quiz-opt');
    buttons.forEach((b, i) => {
      const text = b.querySelector<HTMLElement>('.quiz-opt-text');
      if (text) text.textContent = opts[i];
      b.classList.remove('quiz-correct', 'quiz-wrong');
    });

    this.locked = false;
  }
}
