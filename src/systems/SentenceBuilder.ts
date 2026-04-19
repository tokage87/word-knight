import Phaser from 'phaser';
import SENTENCES_RAW from '../data/sentences.json';
import STORIES_RAW from '../data/stories.json';

interface SentenceStep {
  correct: string;
  distractor: string;
}

export interface Sentence {
  id: string;
  pl: string;
  steps: SentenceStep[];
}

export interface Story {
  id: string;
  title: string;
  sentences: Sentence[];
}

const SENTENCES: Sentence[] = SENTENCES_RAW as Sentence[];
const STORIES: Story[] = STORIES_RAW as Story[];

// Build-the-sentence mini-task. Shown on level-up BEFORE the SkillPicker
// so the player has to translate the Polish prompt word-by-word before
// claiming their reward. W = left option, E = right option (click also
// works). Wrong picks briefly flash red + reveal the correct word, then
// the task auto-advances so the player learns rather than grinds.
//
// Two modes share the same UI shell:
//   • single-sentence gate (`sentence:show`) — used on upgrade-only
//     level-ups. Always resolves to `sentence:complete`.
//   • multi-sentence story gate (`story:show`) — used on level-ups
//     where a new-spell card is available. Plays 4-5 sentences back
//     to back; wrong answers accumulate. Resolves to `story:complete`
//     with `{ perfect }`. The scene uses that flag to gate whether
//     "new" spell cards can be offered in the picker.
export class SentenceBuilder {
  private root?: HTMLElement;
  private current?: Sentence;
  private stepIndex = 0;
  private picked: string[] = [];
  private locked = false;
  private onKeyDown = (ev: KeyboardEvent) => this.handleKey(ev);

  // Story-mode state. `story` is defined iff we are in a multi-sentence
  // run; `storyIndex` points at the current sentence; `mistakes`
  // accumulates across ALL sentences (single or story) so any wrong
  // pick fails the gate and triggers the weakened-upgrade path.
  private story?: Story;
  private storyIndex = 0;
  private mistakes = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('sentence-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = '';
    root.classList.remove('sentence--visible');

    this.scene.game.events.on('sentence:show', this.show, this);
    this.scene.game.events.on('story:show', this.showStory, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('sentence:show', this.show, this);
      this.scene.game.events.off('story:show', this.showStory, this);
      window.removeEventListener('keydown', this.onKeyDown);
    });
  }

  static pickRandom(): Sentence {
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  }

  static pickRandomStory(): Story {
    return STORIES[Math.floor(Math.random() * STORIES.length)];
  }

  private show(sentence: Sentence) {
    if (!this.root) return;
    this.story = undefined;
    this.current = sentence;
    this.stepIndex = 0;
    this.picked = [];
    this.locked = false;
    this.mistakes = 0;
    this.root.classList.add('sentence--visible');
    this.render();
    window.addEventListener('keydown', this.onKeyDown);
  }

  private showStory(story: Story) {
    if (!this.root || !story.sentences.length) return;
    this.story = story;
    this.storyIndex = 0;
    this.mistakes = 0;
    this.current = story.sentences[0];
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

    // Story mode adds a title + "Sentence N / total" progress strip and
    // swaps the subtitle so the player knows they're inside a multi-part
    // gate. The inner sentence UI is identical to single-sentence mode.
    const storyHeader = this.story
      ? `<div class="sentence-story-title">${this.story.title}</div>
         <div class="sentence-story-progress">Zdanie ${this.storyIndex + 1} / ${this.story.sentences.length}${this.mistakes > 0 ? ` · błędy: ${this.mistakes}` : ''}</div>`
      : '';
    const kindLabel = this.story ? 'STORY' : 'TASK';
    const subtitle = this.story ? 'Ułóż opowieść' : 'Ułóż zdanie';

    this.root.innerHTML = `
      <div class="sentence${this.story ? ' sentence--story' : ''}">
        <div class="sentence-kind">${kindLabel}</div>
        ${storyHeader}
        <div class="sentence-title">${subtitle}</div>
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
      // the player sees the right answer. In story mode every wrong pick
      // is counted; any mistake prevents new-spell cards from showing up
      // in the post-story picker (upgrades still available).
      btn.classList.add('sentence-wrong');
      this.root!.querySelectorAll<HTMLButtonElement>('.sentence-opt').forEach((b) => {
        if (b.dataset.word === step.correct) b.classList.add('sentence-correct');
      });
      this.picked.push(step.correct);
      this.mistakes += 1;
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
    // Story mode: advance to the next sentence in the story, or emit
    // `story:complete` with the perfect flag once all sentences are done.
    if (this.story) {
      this.storyIndex += 1;
      if (this.storyIndex < this.story.sentences.length) {
        this.current = this.story.sentences[this.storyIndex];
        this.stepIndex = 0;
        this.picked = [];
        this.locked = false;
        this.render();
        return;
      }
      const id = this.story.id;
      const perfect = this.mistakes === 0;
      this.story = undefined;
      this.hide();
      this.scene.game.events.emit('story:complete', { id, perfect });
      return;
    }

    const id = this.current?.id;
    const perfect = this.mistakes === 0;
    this.hide();
    this.scene.game.events.emit('sentence:complete', { id, perfect });
  }
}
