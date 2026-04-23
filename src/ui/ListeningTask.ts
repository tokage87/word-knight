import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchId, payloadFor, submitGate } from '../systems/CityBranches';
import type { ListeningSentence } from '../systems/UnlockGates';
import { cancelSpeak, isTtsSupported, sourceLangCode, speak } from '../systems/speech';
import { curriculumCatalog } from '../systems/CurriculumCatalog';

// Listening gate — opens for branches with gate.kind === 'listening'
// (Water / Biblioteka Magii). Shows each English sentence with the
// target words knocked out. Student presses 🔊 to hear it, then taps
// chips (correct + distractors) to fill the blanks in order. A wrong
// pick parks the word in the gap as red until the student taps the
// gap to clear it. DALEJ enables when every gap is filled correctly.

interface Segment {
  type: 'text' | 'gap';
  value: string;    // for 'text': literal text; for 'gap': the expected word (canonical form)
  gapIndex?: number; // position in the correctWords array (for gap segments)
}

export class ListeningTask {
  private root?: HTMLElement;
  private branch?: BranchId;
  private sentences: ListeningSentence[] = [];
  private idx = 0;
  private segments: Segment[] = [];
  private filled: Array<string | null> = []; // filled[gapIndex] = chosen word or null
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('writing-task-root');
    if (!root) return;
    this.root = root;
    this.scene.game.events.on('writing:start', this.open, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('writing:start', this.open, this);
      window.removeEventListener('keydown', this.onKey);
      cancelSpeak();
    });
  }

  private open(payload: { branchId: BranchId }) {
    if (BRANCH_DEFS[payload.branchId].gate.kind !== 'listening') return;
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('writing-task-root') ?? undefined;
    }
    if (!this.root) return;
    const p = payloadFor(payload.branchId, 'listening');
    if (!p) return;
    this.branch = payload.branchId;
    this.sentences = p.sentences;
    this.idx = 0;
    this.loadSentence(true);
    this.root.classList.add('writing-task--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private loadSentence(autoSpeak: boolean) {
    const s = this.sentences[this.idx]!;
    this.segments = buildSegments(s.en, s.correctWords);
    this.filled = s.correctWords.map(() => null);
    this.render(autoSpeak);
  }

  private close() {
    if (!this.root) return;
    cancelSpeak();
    this.root.classList.remove('writing-task--visible');
    this.root.innerHTML = '';
    this.branch = undefined;
    this.sentences = [];
    this.segments = [];
    this.filled = [];
    window.removeEventListener('keydown', this.onKey);
  }

  private render(autoSpeak = false) {
    if (!this.root || !this.branch) return;
    const branch = BRANCH_DEFS[this.branch];
    const total = this.sentences.length;
    const s = this.sentences[this.idx]!;

    // Tray = all correct words + distractors shuffled. Disable chips
    // whose word is already placed in a gap so each chip is single-use.
    const chipWords = shuffleStable([...s.correctWords, ...s.distractors]);
    const usedLc = new Set(this.filled.filter((v): v is string => !!v).map(lc));

    const chipsHtml = chipWords.map((w) => {
      const isUsed = usedLc.has(lc(w));
      return `<button class="lt-chip${isUsed ? ' lt-chip--used' : ''}" data-word="${escapeAttr(w)}"${isUsed ? ' disabled' : ''} type="button">${escapeHtml(w)}</button>`;
    }).join('');

    const sentenceHtml = this.segments.map((seg) => {
      if (seg.type === 'text') return `<span class="lt-word">${escapeHtml(seg.value)}</span>`;
      const gi = seg.gapIndex!;
      const chosen = this.filled[gi];
      if (chosen === null || chosen === undefined) {
        return `<button class="lt-gap lt-gap--empty" data-gap="${gi}" type="button">___</button>`;
      }
      const correct = lc(chosen) === lc(seg.value);
      const cls = correct ? 'lt-gap lt-gap--correct' : 'lt-gap lt-gap--wrong';
      return `<button class="${cls}" data-gap="${gi}" type="button">${escapeHtml(chosen)}</button>`;
    }).join(' ');

    const allFilled = this.filled.every((v) => v !== null);
    const allCorrect = allFilled && this.filled.every((v, i) =>
      lc(v!) === lc((this.segments.find((s) => s.type === 'gap' && s.gapIndex === i) as Segment).value),
    );

    let statusLine: string;
    if (!allFilled) {
      const emptyCount = this.filled.filter((v) => v === null).length;
      statusLine = `<span class="lt-status">Uzupełnij ${emptyCount} ${emptyCount === 1 ? 'brakujące słowo' : 'brakujące słowa'}.</span>`;
    } else if (allCorrect) {
      statusLine = '<span class="lt-status lt-status--ok">Świetnie! Możesz iść dalej.</span>';
    } else {
      statusLine = '<span class="lt-status lt-status--bad">Jedno lub więcej słów jest złe — kliknij w czerwone pole, żeby je wyczyścić.</span>';
    }

    const speakHtml = isTtsSupported()
      ? `<button class="lt-speak" type="button"><span class="lt-speak-ico" aria-hidden="true">🔊</span><span>Odsłuchaj zdanie</span></button>`
      : `<div class="lt-no-tts">Twoja przeglądarka nie obsługuje odtwarzania mowy.</div>`;

    const nextLabel = this.idx + 1 < total ? 'DALEJ' : 'GOTOWE';

    this.root.innerHTML = `
      <div class="wt-panel paper-scroll">
        <div class="wt-header">
          <div class="wt-icon-slot"><span class="wt-icon">${branch.icon}</span></div>
          <div class="wt-title-block">
            <div class="wt-title">${escapeHtml(branch.label)} — słuchanie</div>
            <div class="wt-prompt-pl">Posłuchaj zdania i uzupełnij brakujące słowa z puli poniżej.</div>
            <div class="wt-prompt-en">Zdanie ${this.idx + 1} / ${total}</div>
          </div>
          <button class="wt-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="lt-body">
          ${speakHtml}
          <div class="lt-sentence-fill">${sentenceHtml}</div>
          <div class="lt-chips">${chipsHtml}</div>
          ${statusLine}
        </div>
        <div class="wt-footer">
          <button class="wt-cancel" type="button">ANULUJ</button>
          <button class="wt-submit" type="button"${allCorrect ? '' : ' disabled'}>${nextLabel}</button>
        </div>
      </div>
    `;

    this.root.querySelector('.wt-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-cancel')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-submit')!.addEventListener('click', () => this.advance());

    const lang = sourceLangCode(curriculumCatalog.getActiveSelection().source);
    this.root.querySelector('.lt-speak')?.addEventListener('click', () =>
      speak(s.en, { lang, rate: 0.85 }),
    );

    this.root.querySelectorAll<HTMLButtonElement>('.lt-chip:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => this.fillNextGap(btn.dataset.word ?? ''));
    });

    this.root.querySelectorAll<HTMLButtonElement>('.lt-gap').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gi = Number(btn.dataset.gap);
        if (Number.isFinite(gi)) this.clearGap(gi);
      });
    });

    if (autoSpeak && isTtsSupported()) {
      window.setTimeout(() => speak(s.en, { lang, rate: 0.85 }), 120);
    }
  }

  private fillNextGap(word: string) {
    const next = this.filled.findIndex((v) => v === null);
    if (next < 0) return;
    this.filled[next] = word;
    this.render();
  }

  private clearGap(gi: number) {
    if (this.filled[gi] === null || this.filled[gi] === undefined) return;
    this.filled[gi] = null;
    this.render();
  }

  private advance() {
    if (!this.branch) return;
    cancelSpeak();
    if (this.idx + 1 < this.sentences.length) {
      this.idx += 1;
      this.loadSentence(true);
    } else {
      const transcript = this.sentences.map((s) => `HEARD: "${s.en}"`).join('\n');
      submitGate(this.branch, transcript);
      this.scene.game.events.emit('writing:completed', { branchId: this.branch });
      this.close();
    }
  }
}

// Split a sentence into text+gap segments. Greedy — walks the correct
// word list left-to-right, finds the first unconsumed occurrence of
// each target word in the source, and replaces it with a gap.
function buildSegments(sentence: string, correctWords: string[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  correctWords.forEach((word, gapIndex) => {
    // Find next occurrence of `word` (case-insensitive, word-boundary) from cursor.
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const slice = sentence.slice(cursor);
    const m = re.exec(slice);
    if (!m) return;
    const start = cursor + m.index;
    const end = start + m[0].length;
    if (start > cursor) {
      segments.push({ type: 'text', value: sentence.slice(cursor, start) });
    }
    segments.push({ type: 'gap', value: word, gapIndex });
    cursor = end;
  });
  if (cursor < sentence.length) {
    segments.push({ type: 'text', value: sentence.slice(cursor) });
  }
  return segments;
}

function lc(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, '').trim();
}

// Seeded shuffle keyed on the words so re-renders don't reshuffle the
// tray on every click (which would disorient the student).
function shuffleStable<T extends string>(arr: T[]): T[] {
  const a = [...arr];
  // Simple hash of the joined input as seed, then Fisher-Yates with
  // a linear-congruential PRNG so order is stable across renders of
  // the same chip set.
  let seed = 0;
  for (const w of arr) for (let i = 0; i < w.length; i++) seed = (seed * 31 + w.charCodeAt(i)) | 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) % 10000) / 10000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
