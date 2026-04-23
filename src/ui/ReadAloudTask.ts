import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchId, payloadFor, submitGate } from '../systems/CityBranches';
import { isSrSupported, listen, sourceLangCode, tokenizeEn, tokenOverlap } from '../systems/speech';
import { curriculumCatalog } from '../systems/CurriculumCatalog';

// Read-aloud gate — opens for branches with gate.kind === 'readAloud'
// (Fire / Sala Bojowa). Shows an English sentence and asks the student
// to read it into the mic. Passes when ≥ 70% of target tokens appear
// in the transcript. Up to 3 attempts, then a "type it instead" escape
// hatch. In browsers without SpeechRecognition (Firefox/Safari), the
// typing fallback is the primary path.

const PASS_THRESHOLD = 0.7;
const MAX_ATTEMPTS = 3;

export class ReadAloudTask {
  private root?: HTMLElement;
  private branch?: BranchId;
  private busy = false;
  private typingFallback = false;
  private typed = '';
  private lastTranscript = '';
  private lastHits: boolean[] = [];
  private attempts = 0;
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
    });
  }

  private open(payload: { branchId: BranchId }) {
    if (BRANCH_DEFS[payload.branchId].gate.kind !== 'readAloud') return;
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('writing-task-root') ?? undefined;
    }
    if (!this.root) return;
    this.branch = payload.branchId;
    this.busy = false;
    this.typingFallback = !isSrSupported();
    this.typed = '';
    this.lastTranscript = '';
    this.lastHits = [];
    this.attempts = 0;
    this.render();
    this.root.classList.add('writing-task--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private close() {
    if (!this.root) return;
    this.root.classList.remove('writing-task--visible');
    this.root.innerHTML = '';
    this.branch = undefined;
    window.removeEventListener('keydown', this.onKey);
  }

  private render() {
    if (!this.root || !this.branch) return;
    const branch = BRANCH_DEFS[this.branch];
    const p = payloadFor(this.branch, 'readAloud');
    if (!p) return;
    const targetTokens = tokenizeEn(p.sentence);
    const wordsHtml = targetTokens
      .map((w, i) => {
        const cls = this.lastHits.length
          ? this.lastHits[i]
            ? 'ra-word ra-word--hit'
            : 'ra-word ra-word--miss'
          : 'ra-word';
        return `<span class="${cls}">${escapeHtml(w)}</span>`;
      })
      .join(' ');

    const hintBlock = p.hintPl
      ? `<div class="ra-hint-pl">${escapeHtml(p.hintPl)}</div>`
      : '';

    let body: string;
    if (this.typingFallback) {
      body = `
        <div class="ra-body">
          <div class="ra-sentence">${wordsHtml}</div>
          ${hintBlock}
          <div class="ra-type-note">Wpisz zdanie dokładnie tak, jak je widzisz:</div>
          <textarea class="ra-input" spellcheck="false" placeholder="Wpisz po angielsku…">${escapeHtml(this.typed)}</textarea>
        </div>
      `;
    } else {
      const statusLine = this.busy
        ? '<span class="ra-status ra-status--busy">Słucham… powiedz zdanie wyraźnie i kliknij, gdy skończysz.</span>'
        : this.lastTranscript
          ? `<span class="ra-status">Usłyszałem: <b>${escapeHtml(this.lastTranscript)}</b></span>`
          : '<span class="ra-status">Kliknij mikrofon i przeczytaj zdanie na głos.</span>';

      const attemptsLine =
        this.attempts > 0 && this.attempts < MAX_ATTEMPTS
          ? `<div class="ra-attempts">Próba ${this.attempts} / ${MAX_ATTEMPTS}</div>`
          : '';
      const maxedOut = this.attempts >= MAX_ATTEMPTS;
      const fallbackBtn = maxedOut
        ? `<button class="ra-fallback" type="button">Wolę wpisać zdanie</button>`
        : '';

      body = `
        <div class="ra-body">
          <div class="ra-sentence">${wordsHtml}</div>
          ${hintBlock}
          <button class="ra-mic${this.busy ? ' ra-mic--busy' : ''}" type="button"${this.busy ? ' disabled' : ''}>
            <span class="ra-mic-ico" aria-hidden="true">🎤</span>
            <span>${this.busy ? 'Słucham…' : 'Naciśnij i mów'}</span>
          </button>
          ${statusLine}
          ${attemptsLine}
          ${fallbackBtn}
        </div>
      `;
    }

    const submitDisabled = this.typingFallback
      ? !this.typedPasses(p.sentence)
      : true; // auto-submit on pass in mic mode

    this.root.innerHTML = `
      <div class="wt-panel paper-scroll">
        <div class="wt-header">
          <div class="wt-icon-slot"><span class="wt-icon">${branch.icon}</span></div>
          <div class="wt-title-block">
            <div class="wt-title">${escapeHtml(branch.label)} — czytanie na głos</div>
            <div class="wt-prompt-pl">${this.typingFallback ? 'Mikrofon niedostępny. Wpisz zdanie ręcznie, żeby przejść.' : 'Naciśnij mikrofon i przeczytaj angielskie zdanie na głos.'}</div>
            <div class="wt-prompt-en">${this.typingFallback ? 'Typing mode' : 'Speak aloud'}</div>
          </div>
          <button class="wt-close" type="button" aria-label="Zamknij"></button>
        </div>
        ${body}
        <div class="wt-footer">
          <button class="wt-cancel" type="button">ANULUJ</button>
          <button class="wt-submit" type="button"${submitDisabled ? ' disabled' : ''}>GOTOWE</button>
        </div>
      </div>
    `;

    this.root.querySelector('.wt-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-cancel')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-submit')!.addEventListener('click', () => {
      if (this.typingFallback && this.typedPasses(p.sentence)) this.complete();
    });

    this.root.querySelector('.ra-mic')?.addEventListener('click', () => this.runRecognition());
    this.root.querySelector('.ra-fallback')?.addEventListener('click', () => {
      this.typingFallback = true;
      this.render();
    });
    const ta = this.root.querySelector<HTMLTextAreaElement>('.ra-input');
    if (ta) {
      ta.focus();
      ta.addEventListener('input', () => {
        this.typed = ta.value;
        const submit = this.root!.querySelector<HTMLButtonElement>('.wt-submit');
        if (submit) submit.disabled = !this.typedPasses(p.sentence);
      });
    }
  }

  private typedPasses(target: string): boolean {
    return tokenOverlap(target, this.typed) >= PASS_THRESHOLD;
  }

  private async runRecognition() {
    if (!this.branch || this.busy) return;
    const p = payloadFor(this.branch, 'readAloud');
    if (!p) return;
    this.busy = true;
    this.lastTranscript = '';
    this.render();
    try {
      const lang = sourceLangCode(curriculumCatalog.getActiveSelection().source);
      const { transcript } = await listen({ lang });
      this.lastTranscript = transcript;
      this.evaluate(transcript, p.sentence);
    } catch (e) {
      this.lastTranscript = `(${(e as Error).message})`;
    }
    this.busy = false;
    this.attempts += 1;
    this.render();
  }

  private evaluate(transcript: string, sentence: string) {
    const target = tokenizeEn(sentence);
    const spokenSet = new Set(tokenizeEn(transcript));
    this.lastHits = target.map((w) => spokenSet.has(w));
    if (tokenOverlap(sentence, transcript) >= PASS_THRESHOLD) {
      // defer so the final render flashes green before we close.
      window.setTimeout(() => this.complete(), 350);
    }
  }

  private complete() {
    if (!this.branch) return;
    const p = payloadFor(this.branch, 'readAloud')!;
    const record = `SPOKE: "${p.sentence}" heard as "${this.lastTranscript || this.typed}"`;
    submitGate(this.branch, record);
    this.scene.game.events.emit('writing:completed', { branchId: this.branch });
    this.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
