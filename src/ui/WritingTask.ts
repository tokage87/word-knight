import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchId, countWords, submitWritingTask } from '../systems/CityBranches';
import { textJudge } from '../systems/TextJudge';
import { deepJudge } from '../systems/DeepJudge';

// Full-screen writing overlay: prompt + textarea + live meters +
// optional deep feedback via WebLLM. Opens when the player clicks
// [ROZPOCZNIJ] on a locked branch and closes when they submit or
// cancel.
//
// Two asynchronous systems drive the meters:
//   - TextJudge (Transformers.js embeddings, ~120MB) — always active
//     once loaded; scores topic match live as the student types.
//   - DeepJudge (WebLLM Llama-3.2-3B, ~2GB) — opt-in; student clicks
//     "Sprawdź szczegółowo" to download + evaluate.
// Progress bars for both downloads are rendered inline.

const UNLOCK_MIN_WORDS = 30;
const UNLOCK_MIN_TOPIC = 0.55;

export class WritingTask {
  private root?: HTMLElement;
  private branch?: BranchId;
  private text = '';
  private topicScore = 0;
  private topicScoring = false;
  private scoreDebounceTimer?: number;
  private deepVerdict?: { score: number; feedback: string };
  private deepBusy = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };
  private stopTextListener?: () => void;
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
      this.stopTextListener?.();
      this.stopDeepListener?.();
      if (this.root) this.root.innerHTML = '';
    });
  }

  private open(payload: { branchId: BranchId }) {
    if (!this.root) return;
    this.branch = payload.branchId;
    this.text = '';
    this.topicScore = 0;
    this.deepVerdict = undefined;
    this.render();
    this.root.classList.add('writing-task--visible');
    window.addEventListener('keydown', this.onKey);

    // Kick off the embeddings download (fire-and-forget). The
    // progress callback re-renders the "🎯 Topic match" area with
    // a bar while MB stream in; once ready we score live as the
    // student types.
    this.stopTextListener?.();
    this.stopTextListener = textJudge.onProgress(() => this.refreshMetersOnly());
    void textJudge.init().then(() => this.scoreNow());
  }

  private close() {
    if (!this.root) return;
    this.root.classList.remove('writing-task--visible');
    this.root.innerHTML = '';
    this.branch = undefined;
    this.text = '';
    window.removeEventListener('keydown', this.onKey);
    this.stopTextListener?.();
    this.stopDeepListener?.();
  }

  private render() {
    if (!this.root || !this.branch) return;
    const branch = BRANCH_DEFS[this.branch];
    const hintChips = branch.task.hintWords
      .map((w) => `<button class="wt-hint-chip" data-word="${w}" type="button">${w}</button>`)
      .join('');

    this.root.innerHTML = `
      <div class="wt-panel">
        <div class="wt-header">
          <div class="wt-icon">${branch.icon}</div>
          <div class="wt-title-block">
            <div class="wt-title">${branch.label} — zadanie pisemne</div>
            <div class="wt-prompt-pl">${branch.task.prompt}</div>
            <div class="wt-prompt-en">${branch.task.promptEn}</div>
          </div>
          <button class="wt-close" type="button" aria-label="Zamknij">×</button>
        </div>

        <div class="wt-hint">
          <div class="wt-hint-label">💡 ${branch.task.hint}</div>
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
      this.debouncedScore();
    });

    // Hint chips insert the word at the cursor and give focus back.
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
        this.debouncedScore();
      });
    });

    this.root.querySelector('.wt-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-cancel')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-submit')!.addEventListener('click', () => this.submit());

    this.refreshMetersOnly();
    this.renderDeepSection();
  }

  // Re-render just the meters + submit-enable state (cheap; runs on
  // every keystroke). The main panel HTML is rebuilt only on open.
  private refreshMetersOnly() {
    if (!this.root || !this.branch) return;
    const meters = this.root.querySelector<HTMLElement>('.wt-meters');
    if (!meters) return;
    const { total, distinct } = countWords(this.text);
    const tj = textJudge.getLastProgress();
    const topicReady = tj.phase === 'ready';

    const wordOk = total >= UNLOCK_MIN_WORDS;
    const topicPct = Math.round(this.topicScore * 100);
    const topicOk = topicReady && this.topicScore >= UNLOCK_MIN_TOPIC;
    const canSubmit = wordOk && topicOk;

    const topicBlock = topicReady
      ? `<div class="wt-meter ${topicOk ? 'wt-meter--ok' : 'wt-meter--bad'}">
           <div class="wt-meter-label">🎯 Trafienie w temat</div>
           <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${topicPct}%"></div></div>
           <div class="wt-meter-val">${topicPct}% ${this.topicScoring ? '…' : topicOk ? '✓' : `(min. ${Math.round(UNLOCK_MIN_TOPIC * 100)}%)`}</div>
         </div>`
      : `<div class="wt-meter wt-meter--loading">
           <div class="wt-meter-label">🎯 Ładowanie oceniającego (~120 MB, raz na komputer)</div>
           <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${Math.round((tj.percent ?? 0) * 100) || (tj.percent ?? 0)}%"></div></div>
           <div class="wt-meter-val">${formatLoadLabel(tj)}</div>
         </div>`;

    meters.innerHTML = `
      <div class="wt-meter ${wordOk ? 'wt-meter--ok' : 'wt-meter--bad'}">
        <div class="wt-meter-label">📝 Liczba słów</div>
        <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${Math.min(100, (total / UNLOCK_MIN_WORDS) * 100)}%"></div></div>
        <div class="wt-meter-val">${total} / ${UNLOCK_MIN_WORDS} ${wordOk ? '✓' : ''}</div>
      </div>
      <div class="wt-meter-info">Różne słowa: <b>${distinct}</b></div>
      ${topicBlock}
    `;

    const submit = this.root.querySelector<HTMLButtonElement>('.wt-submit');
    if (submit) submit.disabled = !canSubmit;
  }

  private debouncedScore() {
    if (this.scoreDebounceTimer) window.clearTimeout(this.scoreDebounceTimer);
    this.scoreDebounceTimer = window.setTimeout(() => this.scoreNow(), 700);
  }

  private async scoreNow() {
    if (!this.branch || !textJudge.isReady()) return;
    if (this.topicScoring) return;
    const branch = this.branch;
    this.topicScoring = true;
    this.refreshMetersOnly();
    try {
      this.topicScore = await textJudge.scoreTopic(this.text, branch);
    } catch {
      this.topicScore = 0;
    }
    this.topicScoring = false;
    this.refreshMetersOnly();
  }

  // ────── "Sprawdź szczegółowo" path (WebLLM) ──────

  private renderDeepSection() {
    if (!this.root) return;
    const host = this.root.querySelector<HTMLElement>('.wt-deep');
    if (!host) return;
    if (this.deepVerdict) {
      const v = this.deepVerdict;
      host.innerHTML = `
        <div class="wt-deep-verdict">
          <div class="wt-deep-score">Ocena: ${'⭐'.repeat(v.score)}${'☆'.repeat(5 - v.score)} (${v.score}/5)</div>
          <div class="wt-deep-feedback">${escapeHtml(v.feedback)}</div>
        </div>`;
      return;
    }
    if (this.deepBusy) {
      const p = deepJudge.isReady() ? { phase: 'ready', percent: 100, text: 'Oceniam…' } : (deepJudge as any).lastProgress ?? { percent: 0, text: '' };
      host.innerHTML = `
        <div class="wt-deep-loading">
          <div class="wt-deep-label">📝 Szczegółowa ocena — ładuję model (~2 GB przy pierwszym uruchomieniu, potem cache)</div>
          <div class="wt-meter-bar"><div class="wt-meter-fill" style="width:${p.percent}%"></div></div>
          <div class="wt-meter-val">${escapeHtml(p.text || `${p.percent}%`)}</div>
        </div>`;
      return;
    }
    host.innerHTML = `
      <button class="wt-deep-start" type="button">📝 Sprawdź szczegółowo (AI)</button>
      <div class="wt-deep-note">Pobierze jednorazowo ~2&nbsp;GB przy pierwszym użyciu — potem odpowiedź w kilka sekund.</div>
    `;
    host.querySelector('.wt-deep-start')!.addEventListener('click', () => this.runDeep());
  }

  private async runDeep() {
    if (!this.branch) return;
    const text = this.text.trim();
    if (!text) return;
    this.deepBusy = true;
    this.stopDeepListener?.();
    this.stopDeepListener = deepJudge.onProgress(() => this.renderDeepSection());
    this.renderDeepSection();
    try {
      await deepJudge.init();
      const verdict = await deepJudge.evaluate({
        prompt: BRANCH_DEFS[this.branch].task.promptEn,
        text,
      });
      this.deepVerdict = verdict;
    } catch (e) {
      this.deepVerdict = { score: 3, feedback: `Nie udało się ocenić: ${(e as Error).message}` };
    }
    this.deepBusy = false;
    this.renderDeepSection();
  }

  // ────── submit ──────

  private submit() {
    if (!this.branch) return;
    const text = this.text.trim();
    if (!text) return;
    submitWritingTask(this.branch, text);
    this.scene.game.events.emit('writing:completed', { branchId: this.branch });
    this.close();
  }
}

function formatLoadLabel(p: ReturnType<typeof textJudge.getLastProgress>): string {
  if (p.phase === 'ready') return 'Gotowe ✓';
  if (p.percent && p.percent > 1) return `${Math.round(p.percent)}%`;
  if (p.loadedBytes && p.totalBytes) {
    return `${(p.loadedBytes / 1024 / 1024).toFixed(1)} / ${(p.totalBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return 'rozpoczynam…';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
