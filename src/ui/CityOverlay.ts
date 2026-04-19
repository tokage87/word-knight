import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchDef, type BranchId } from '../systems/CityBranches';
import { metaStore } from '../systems/MetaStore';

// HTML overlay for the City's branch-detail view. Lives in
// #city-overlay-root. Opens on `city:branchClick`, renders the
// challenge state + upgrade scroll, handles [KUP] purchases. Stays
// pure DOM (no Phaser objects) so the Tiny Swords Phaser scene
// beneath keeps animating while a panel is open.
export class CityOverlay {
  private root?: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.hide();
  };

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('city-overlay-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = '';
    root.classList.remove('city-overlay--visible');

    this.scene.game.events.on('city:branchClick', this.onBranchClick, this);
    this.scene.game.events.on('writing:completed', this.onWritingCompleted, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('city:branchClick', this.onBranchClick, this);
      this.scene.game.events.off('writing:completed', this.onWritingCompleted, this);
      window.removeEventListener('keydown', this.onKey);
      if (this.root) this.root.innerHTML = '';
    });
  }

  // Re-render the city panel when a writing task unlocks a branch, so
  // the student sees the upgrade list immediately.
  private onWritingCompleted(payload: { branchId: BranchId }) {
    const branch = BRANCH_DEFS[payload.branchId];
    if (branch && this.root?.classList.contains('city-overlay--visible')) {
      this.render(branch);
    }
  }

  private onBranchClick(payload: { id: BranchId }) {
    const branch = BRANCH_DEFS[payload.id];
    if (!branch) return;
    this.show(branch);
  }

  private show(branch: BranchDef) {
    if (!this.root) return;
    this.render(branch);
    this.root.classList.add('city-overlay--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private hide() {
    if (!this.root) return;
    this.root.classList.remove('city-overlay--visible');
    this.root.innerHTML = '';
    window.removeEventListener('keydown', this.onKey);
  }

  private render(branch: BranchDef) {
    if (!this.root) return;
    const unlocked = branch.isUnlocked();
    const gold = metaStore.getGold();

    const challengeBlock = unlocked
      ? `<div class="city-challenge">
           <div class="city-challenge-label">Zadanie: ${escapeHtml(branch.task.prompt)}</div>
           <div class="city-challenge-body"><span class="city-challenge-done">✓ Odblokowane</span></div>
         </div>`
      : `<div class="city-challenge">
           <div class="city-challenge-label">Wyzwanie (zadanie pisemne po angielsku):</div>
           <div class="city-challenge-body"><b>${escapeHtml(branch.task.prompt)}</b></div>
           <div class="city-challenge-sub">${escapeHtml(branch.task.promptEn)}</div>
           <button class="city-task-start" type="button" data-branch="${branch.id}">
             📝 ROZPOCZNIJ ZADANIE
           </button>
         </div>`;

    // Upgrade rows — greyed and un-buyable until the branch is unlocked.
    const rowsHtml = branch.upgrades.map((u) => {
      const r = u.currentRank();
      const maxed = r >= u.maxRank;
      const cost = maxed ? 0 : u.costAtRank(r);
      const affordable = !maxed && gold >= cost;
      const nextRank = Math.min(r + 1, u.maxRank);
      const rankLabel = u.maxRank > 1 ? ` ${romanCaps(nextRank)}` : '';
      const buyLabel = maxed ? 'MAX' : !unlocked ? '🔒' : `${cost} ⚒`;
      const buyDisabled = maxed || !unlocked || !affordable;
      return `
        <div class="city-upgrade-row ${maxed ? 'city-upgrade-row--maxed' : ''}">
          <div class="city-upgrade-main">
            <div class="city-upgrade-title">${escapeHtml(u.label)}${rankLabel}</div>
            <div class="city-upgrade-desc">${maxed ? 'Osiągnięto maks. poziom.' : escapeHtml(u.describe(nextRank))}</div>
            <div class="city-upgrade-ranks">${renderRankPips(r, u.maxRank)}</div>
          </div>
          <button class="city-upgrade-buy" data-upgrade="${u.id}"${buyDisabled ? ' disabled' : ''}>${buyLabel}</button>
        </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="city-panel">
        <div class="city-panel-header">
          <div class="city-panel-icon">${branch.icon}</div>
          <div class="city-panel-title">${escapeHtml(branch.label)}</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij">×</button>
        </div>
        ${challengeBlock}
        <div class="city-upgrade-list">
          ${rowsHtml}
        </div>
        <div class="city-panel-footer">
          <span class="city-gold">⚒ ${gold}</span>
          <button class="city-panel-back" type="button">WRÓĆ</button>
        </div>
      </div>
    `;

    this.root.querySelector('.city-panel-close')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.city-panel-back')!.addEventListener('click', () => this.hide());
    this.root.querySelectorAll<HTMLButtonElement>('.city-upgrade-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.upgrade;
        const u = branch.upgrades.find((x) => x.id === id);
        if (!u) return;
        if (u.buy()) this.render(branch);
      });
    });
    const startBtn = this.root.querySelector<HTMLButtonElement>('.city-task-start');
    startBtn?.addEventListener('click', () => {
      // Let the WritingTask overlay handle it; it lives in a separate
      // root so we don't need to tear down this panel first.
      this.scene.game.events.emit('writing:start', { branchId: branch.id });
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function romanCaps(n: number): string {
  return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : n === 4 ? 'IV' : n === 5 ? 'V' : String(n);
}

// ●●●○○ style pip meter showing owned vs max ranks.
function renderRankPips(owned: number, max: number): string {
  const filled = '<span class="city-rank-pip city-rank-pip--filled"></span>';
  const empty = '<span class="city-rank-pip"></span>';
  return filled.repeat(owned) + empty.repeat(Math.max(0, max - owned));
}
