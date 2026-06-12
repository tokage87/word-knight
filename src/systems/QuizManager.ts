import Phaser from 'phaser';
import { gameEvents } from './events';
import { DomOverlay } from './DomOverlay';
import { curriculumCatalog } from './CurriculumCatalog';
import type { CurriculumVocab } from './CurriculumTypes';
import { STR } from '../i18n/strings';

type VocabEntry = CurriculumVocab;

type KeyCode = 'W' | 'E';

// Compact 2-option quiz in the bottom-right. W = left button, E = right button.
// Click is supported as a fallback, but keyboard is the primary input path.
export class QuizManager extends DomOverlay {
  private current?: VocabEntry;
  private locked = false;
  private inputPaused = false;
  // Keyboard anti-mash grace: when a new word renders, ignore W/E
  // until this timestamp. Mouse clicks are ungated — deliberate aim
  // isn't mashing, and swallowing legitimate clicks made the quiz feel
  // unresponsive.
  private newWordGraceUntilMs = 0;
  // Stable references so SHUTDOWN can unregister them — the UI scene
  // restarts on every death, and anonymous closures left on the global
  // game.events bus (or on the persistent #quiz-root element) would
  // accumulate and double-fire quiz:correct/quiz:wrong. The base class
  // tracks the off()/removeEventListener() halves automatically.
  private pauseInput = () => { this.inputPaused = true; };
  private resumeInput = () => { this.inputPaused = false; };
  private clickHandler = (ev: Event) => this.onClick(ev);

  constructor(scene: Phaser.Scene) {
    super(scene, 'quiz-root', 'quiz--visible');
  }

  protected onMount(root: HTMLElement) {
    // Freeze quiz input while the SentenceBuilder / SkillPicker modals
    // are up; otherwise W/E would answer multiple things at once. The
    // story gate reuses the sentence UI but emits a different event, so
    // it needs its own pause trigger — otherwise W/E would register
    // both as a story pick AND a quiz answer.
    this.onGameEvent('sentence:show', this.pauseInput);
    this.onGameEvent('story:show', this.pauseInput);
    this.onGameEvent('skillpicker:show', this.pauseInput);
    this.onGameEvent('skillpicker:picked', this.resumeInput);
    root.innerHTML = `
      <div class="quiz">
        <div class="quiz-prompt">${STR.quiz.prompt}</div>
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

    this.addRootListener('click', this.clickHandler);

    this.attachWindowKeydown((ev: KeyboardEvent) => {
      const k = ev.key.toUpperCase();
      if (k === 'W' || k === 'E') {
        ev.preventDefault();
        this.pressKey(k);
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
    if (this.scene.time.now < this.newWordGraceUntilMs) return;
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
      gameEvents(this.scene.game).emit('quiz:correct', { id: this.current.id });
      // Moderate slowdown pass: 400→900 ms so the green flash lingers
      // long enough to feel like feedback, not a flicker.
      this.scene.time.delayedCall(900, () => this.loadNext());
    } else {
      btn.classList.add('quiz-wrong');
      gameEvents(this.scene.game).emit('quiz:wrong', { id: this.current.id });
      buttons.forEach((b) => {
        const t = b.querySelector<HTMLElement>('.quiz-opt-text');
        if (t?.textContent?.trim() === this.current!.en) {
          b.classList.add('quiz-correct');
        }
      });
      // 1200→2200 ms: extra time to read the correct answer before
      // moving on, since this is the teachable moment.
      this.scene.time.delayedCall(2200, () => this.loadNext());
    }
  }

  private loadNext() {
    if (!this.root) return;
    const pool = curriculumCatalog.getVocabPool();
    this.current = pool[Math.floor(Math.random() * pool.length)];
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

    // Anti-mash: ignore W/E for 1200 ms so the kid has to see the new
    // word before their next keypress can submit. Mouse clicks are
    // ungated — see onClick.
    this.newWordGraceUntilMs = this.scene.time.now + 1200;
    this.locked = false;
  }
}
