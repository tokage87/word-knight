import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchId, countWords, payloadFor, submitGate } from '../systems/CityBranches';
import { deepJudge } from '../systems/DeepJudge';

// Full-screen writing overlay: prompt + textarea + live meters +
// optional deep feedback via WebLLM. Active only for branches whose
// gate.kind === 'writing'. Listens on 'writing:start' and no-ops for
// other kinds (Listening/ReadAloud/Cloze handlers take those).
//
// Submit gate:
//   - Liczba słów ≥ UNLOCK_MIN_WORDS
//   - Trafione słowa z listy podpowiedzi ≥ UNLOCK_MIN_HINTS
// Optional WebLLM Llama-3.2-3B feedback stays behind the
// "Sprawdź szczegółowo" button for deeper 1-5 evaluation.

const UNLOCK_MIN_WORDS = 15;
const UNLOCK_MIN_HINTS = 3;

export class WritingTask {
  private root?: HTMLElement;
  private branch?: BranchId;
  private text = '';
  private deepVerdict?: { score: number; feedback: string };
  private deepBusy = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };
  private stopDeepListener?: () => void;

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('writing-task-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = '';
    root.classList.remove('writing-task--visible');

    this.scene.game.events.on('writing:start', this.open, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('writing:start', this.open, this);
      window.removeEventListener('keydown', this.onKey);
      this.stopDeepListener?.();
      if (this.root) this.root.innerHTML = '';
    });
  }

  private open(payload: { branchId: BranchId }) {
    // Only respond to writing-kind gates. Other kinds have their own
    // task class listening on the same event.
    if (BRANCH_DEFS[payload.branchId].gate.kind !== 'writing') return;
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('writing-task-root') ?? undefined;
    }
    if (!this.root) return;
    this.branch = payload.branchId;
    this.text = '';
    this.deepVerdict = undefined;
    this.deepBusy = false;
    if (this.stopDeepListener) {
      this.stopDeepListener();
      this.stopDeepListener = undefined;
    }
    this.render();
    this.root.classList.add('writing-task--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private close() {
    if (!this.root) return;
    this.root.classList.remove('writing-task--visible');
    this.root.innerHTML = '';
    this.branch = undefined;
    this.text = '';
    this.deepVerdict = undefined;
    this.deepBusy = false;
    window.removeEventListener('keydown', this.onKey);
    if (this.stopDeepListener) {
      this.stopDeepListener();
      this.stopDeepListener = undefined;
    }
  }

  private render() {
    if (!this.root || !this.branch) return;
    const branch = BRANCH_DEFS[this.branch];
    const p = payloadFor(this.branch, 'writing');
    if (!p) return;
    const hintChips = p.hintWords
      .map((w) => `<button class="wt-hint-chip" data-word="${w}" type="button">${w}</button>`)
      .join('');

    this.root.innerHTML = `
      <div class="wt-panel paper-scroll">
        <div class="wt-header">
          <div class="wt-icon-slot"><span class="wt-icon">${branch.icon}</span></div>
          <div class="wt-title-block">
            <div class="wt-title">${branch.label} — zadanie pisemne</div>
            <div class="wt-prompt-pl">${escapeHtml(p.prompt)}</div>
            <div class="wt-prompt-en">${escapeHtml(p.promptEn)}</div>
          </div>
          <button class="wt-close" type="button" aria-label="Zamknij"></button>
        </div>

        <div class="wt-hint">
          <div class="wt-hint-label"><span class="wt-chip wt-chip--hint" aria-hidden="true"></span><span>${escapeHtml(p.hint)}</span></div>
          <div class="wt-hint-chips">${hintChips}</div>
        </div>

        <textarea class="wt-textarea" placeholder="Pisz po angielsku, ile tylko możesz…" spellcheck="true"></textarea>

        <div class="wt-meters"></div>

        <div class="wt-deep"></div>

        <div class="wt-footer">
          <button class="wt-cancel" type="button">ANULUJ</button>
          <button class="wt-submit" type="button" disabled>GOTOWE</button>
        </div>
      </div>
    `;

    const textarea = this.root.querySelector<HTMLTextAreaElement>('.wt-textarea')!;
    textarea.focus();
    textarea.addEventListener('input', () => {
      this.text = textarea.value;
      this.refreshMetersOnly();
    });

    this.root.querySelectorAll<HTMLButtonElement>('.wt-hint-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const word = chip.dataset.word ?? '';
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const sep = before.length === 0 || /\s$/.test(before) ? '' : ' ';
        const insert = `${sep}${word} `;
        textarea.value = before + insert + after;
        const cursor = (before + insert).length;
        textarea.setSelectionRange(cursor, cursor);
        textarea.focus();
        this.text = textarea.value;
        this.refreshMetersOnly();
      });
    });

    this.root.querySelector('.wt-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-cancel')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-submit')!.addEventListener('click', () => this.submit());

    this.refreshMetersOnly();
    this.renderDeepSection();
  }

  private refreshMetersOnly() {
    if (!this.root || !this.branch) return;
    const meters = this.root.querySelector<HTMLElement>('.wt-meters');
    if (!meters) return;
    const p = payloadFor(this.branch, 'writing');
    if (!p) return;
    const { total, distinct } = countWords(this.text);
    const hintsHit = countHintWordsUsed(this.text, p.hintWords);

    const wordOk = total >= UNLOCK_MIN_WORDS;
    const hintsOk = hintsHit >= UNLOCK_MIN_HINTS;
    const canSubmit = wordOk && hintsOk;

    const tick = '<span class="wt-tick" aria-hidden="true"></span>';
    meters.innerHTML = `
      <div class="wt-meter ${wordOk ? 'wt-meter--ok' : 'wt-meter--bad'}">
        <div class="wt-meter-label"><span class="wt-chip wt-chip--words" aria-hidden="true"></span><span>Liczba słów</span></div>
        <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${Math.min(100, (total / UNLOCK_MIN_WORDS) * 100)}%"></div></div>
        <div class="wt-meter-val">${total} / ${UNLOCK_MIN_WORDS} ${wordOk ? tick : ''}</div>
      </div>
      <div class="wt-meter ${hintsOk ? 'wt-meter--ok' : 'wt-meter--bad'}">
        <div class="wt-meter-label"><span class="wt-chip wt-chip--hint" aria-hidden="true"></span><span>Słowa z podpowiedzi</span></div>
        <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${Math.min(100, (hintsHit / UNLOCK_MIN_HINTS) * 100)}%"></div></div>
        <div class="wt-meter-val">${hintsHit} / ${UNLOCK_MIN_HINTS} ${hintsOk ? tick : ''}</div>
      </div>
      <div class="wt-meter-info">Różne słowa: <b>${distinct}</b></div>
    `;

    const submit = this.root.querySelector<HTMLButtonElement>('.wt-submit');
    if (submit) submit.disabled = !canSubmit;
  }

  private renderDeepSection() {
    if (!this.root) return;
    const host = this.root.querySelector<HTMLElement>('.wt-deep');
    if (!host) return;
    if (this.deepVerdict) {
      const v = this.deepVerdict;
      const filled = '<span class="wt-score-pip wt-score-pip--on" aria-hidden="true"></span>';
      const empty = '<span class="wt-score-pip wt-score-pip--off" aria-hidden="true"></span>';
      host.innerHTML = `
        <div class="wt-deep-verdict">
          <div class="wt-deep-score"><span>Ocena:</span><span class="wt-score-row">${filled.repeat(v.score)}${empty.repeat(5 - v.score)}</span><span class="wt-score-num">${v.score}/5</span></div>
          <div class="wt-deep-feedback">${escapeHtml(v.feedback)}</div>
        </div>`;
      return;
    }
    if (this.deepBusy) {
      const p = deepJudge.isReady() ? { phase: 'ready', percent: 100, text: 'Oceniam…' } : (deepJudge as any).lastProgress ?? { percent: 0, text: '' };
      host.innerHTML = `
        <div class="wt-deep-loading">
          <div class="wt-deep-label"><span class="wt-chip wt-chip--ai" aria-hidden="true"></span><span>Szczegółowa ocena — ładuję model (~2 GB przy pierwszym uruchomieniu, potem cache)</span></div>
          <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${p.percent}%"></div></div>
          <div class="wt-meter-val">${escapeHtml(p.text || `${p.percent}%`)}</div>
        </div>`;
      return;
    }
    host.innerHTML = `
      <button class="wt-deep-start" type="button"><span class="wt-chip wt-chip--ai" aria-hidden="true"></span><span>Sprawdź szczegółowo (AI)</span></button>
      <div class="wt-deep-note">Pobierze jednorazowo ~2&nbsp;GB przy pierwszym użyciu — potem odpowiedź w kilka sekund.</div>
    `;
    host.querySelector('.wt-deep-start')!.addEventListener('click', () => this.runDeep());
  }

  private async runDeep() {
    if (!this.branch) return;
    const p = payloadFor(this.branch, 'writing');
    if (!p) return;
    const text = this.text.trim();
    if (!text) return;
    this.deepBusy = true;
    this.stopDeepListener?.();
    this.stopDeepListener = deepJudge.onProgress(() => this.renderDeepSection());
    this.renderDeepSection();
    try {
      await deepJudge.init();
      const verdict = await deepJudge.evaluate({
        prompt: p.promptEn,
        text,
      });
      this.deepVerdict = verdict;
    } catch (e) {
      this.deepVerdict = { score: 3, feedback: `Nie udało się ocenić: ${(e as Error).message}` };
    }
    this.deepBusy = false;
    this.renderDeepSection();
  }

  private submit() {
    if (!this.branch) return;
    const text = this.text.trim();
    if (!text) return;
    submitGate(this.branch, text);
    this.scene.game.events.emit('writing:completed', { branchId: this.branch });
    this.close();
  }
}

function countHintWordsUsed(text: string, hints: string[]): number {
  const lower = text.toLowerCase();
  const hit = new Set<string>();
  for (const raw of hints) {
    const h = raw.toLowerCase();
    if (h.includes(' ')) {
      if (lower.includes(h)) hit.add(h);
    } else {
      const re = new RegExp(`\\b${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(lower)) hit.add(h);
    }
  }
  return hit.size;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
