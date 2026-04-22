import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchId, payloadFor, submitGate } from '../systems/CityBranches';
import type { ClozeItem } from '../systems/UnlockGates';

// Cloze gate — opens for branches with gate.kind === 'cloze'
// (Wind / Krąg Uczonych). Renders a sentence with a visible GAP and
// three option buttons. Wrong click: shake + turn red, stay on the
// item. Right click: flash green, advance. Finishes after every item
// has been correctly answered once.
export class ClozeTask {
  private root?: HTMLElement;
  private branch?: BranchId;
  private items: ClozeItem[] = [];
  private idx = 0;
  private locked = false;
  private lastPick?: { chosen: string; correct: boolean };
  private wrongPicks = 0;
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
    if (BRANCH_DEFS[payload.branchId].gate.kind !== 'cloze') return;
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('writing-task-root') ?? undefined;
    }
    if (!this.root) return;
    const p = payloadFor(payload.branchId, 'cloze');
    if (!p) return;
    this.branch = payload.branchId;
    this.items = p.items;
    this.idx = 0;
    this.locked = false;
    this.lastPick = undefined;
    this.wrongPicks = 0;
    this.render();
    this.root.classList.add('writing-task--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private close() {
    if (!this.root) return;
    this.root.classList.remove('writing-task--visible');
    this.root.innerHTML = '';
    this.branch = undefined;
    this.items = [];
    window.removeEventListener('keydown', this.onKey);
  }

  private render() {
    if (!this.root || !this.branch) return;
    const branch = BRANCH_DEFS[this.branch];
    const total = this.items.length;
    const item = this.items[this.idx]!;
    const [before, after] = splitGap(item.sentence);

    const optionsHtml = item.options.map((opt) => {
      let cls = 'cz-opt';
      if (this.lastPick && this.lastPick.chosen === opt) {
        cls += this.lastPick.correct ? ' cz-opt--correct' : ' cz-opt--wrong';
      }
      return `<button class="${cls}" data-opt="${escapeAttr(opt)}" type="button">${escapeHtml(opt)}</button>`;
    }).join('');

    const hintBlock = item.hintPl
      ? `<div class="cz-hint-pl">${escapeHtml(item.hintPl)}</div>`
      : '';

    const gapText = this.lastPick?.correct ? escapeHtml(this.lastPick.chosen) : '___';
    const gapCls = this.lastPick?.correct ? 'cz-gap cz-gap--filled' : 'cz-gap';

    this.root.innerHTML = `
      <div class="wt-panel paper-scroll">
        <div class="wt-header">
          <div class="wt-icon-slot"><span class="wt-icon">${branch.icon}</span></div>
          <div class="wt-title-block">
            <div class="wt-title">${escapeHtml(branch.label)} — uzupełnij zdania</div>
            <div class="wt-prompt-pl">Wybierz poprawne słowo, żeby uzupełnić zdanie.</div>
            <div class="wt-prompt-en">Zdanie ${this.idx + 1} / ${total}</div>
          </div>
          <button class="wt-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="cz-body">
          <div class="cz-sentence">
            <span>${escapeHtml(before)}</span>
            <span class="${gapCls}">${gapText}</span>
            <span>${escapeHtml(after)}</span>
          </div>
          ${hintBlock}
          <div class="cz-opts">${optionsHtml}</div>
        </div>
        <div class="wt-footer">
          <button class="wt-cancel" type="button">ANULUJ</button>
          <button class="wt-submit" type="button" disabled>${this.idx + 1 < total ? 'DALEJ' : 'GOTOWE'}</button>
        </div>
      </div>
    `;

    this.root.querySelector('.wt-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.wt-cancel')!.addEventListener('click', () => this.close());
    this.root.querySelectorAll<HTMLButtonElement>('.cz-opt').forEach((btn) => {
      btn.addEventListener('click', () => this.pick(btn.dataset.opt ?? ''));
    });
  }

  private pick(opt: string) {
    if (this.locked || !this.branch) return;
    const item = this.items[this.idx]!;
    const correct = opt === item.correct;
    this.lastPick = { chosen: opt, correct };
    if (correct) {
      this.locked = true;
      this.render();
      window.setTimeout(() => this.advance(), 500);
    } else {
      this.wrongPicks += 1;
      this.render();
      // Clear the wrong-marker after a brief beat so the student can retry.
      window.setTimeout(() => {
        this.lastPick = undefined;
        this.render();
      }, 700);
    }
  }

  private advance() {
    if (!this.branch) return;
    this.locked = false;
    this.lastPick = undefined;
    if (this.idx + 1 < this.items.length) {
      this.idx += 1;
      this.render();
    } else {
      const transcript = this.items.map((it) => it.sentence.replace('{{GAP}}', `[${it.correct}]`)).join('\n');
      submitGate(this.branch, `${transcript}\nWrong picks: ${this.wrongPicks}`);
      this.scene.game.events.emit('writing:completed', { branchId: this.branch });
      this.close();
    }
  }
}

function splitGap(sentence: string): [string, string] {
  const i = sentence.indexOf('{{GAP}}');
  if (i < 0) return [sentence, ''];
  return [sentence.slice(0, i), sentence.slice(i + '{{GAP}}'.length)];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
