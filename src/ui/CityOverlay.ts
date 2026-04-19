import Phaser from 'phaser';
import { BRANCH_DEFS, BranchDef, type BranchId } from '../systems/CityBranches';
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
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('city:branchClick', this.onBranchClick, this);
      window.removeEventListener('keydown', this.onKey);
      if (this.root) this.root.innerHTML = '';
    });
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
    const status = branch.status();
    const gold = metaStore.getGold();

    // Challenge badge at the top — either progress meter or ✓ done.
    const challengeBody = status.unlocked
      ? `<span class="city-challenge-done">✓ Odblokowane</span>`
      : `<span class="city-challenge-progress">${status.current} / ${status.target}</span>`;

    // Upgrade rows — each shows label, current → next rank description,
    // cost, and a buy button (greyed if locked / unaffordable / maxed).
    const rowsHtml = branch.upgrades.map((u) => {
      const r = u.currentRank();
      const maxed = r >= u.maxRank;
      const cost = maxed ? 0 : u.costAtRank(r);
      const affordable = !maxed && gold >= cost;
      const nextRank = Math.min(r + 1, u.maxRank);
      const rankLabel = u.maxRank > 1 ? ` ${romanCaps(nextRank)}` : '';
      const buyLabel = maxed
        ? 'MAX'
        : !status.unlocked
          ? '🔒'
          : `${cost} ⚒`;
      const buyDisabled = maxed || !status.unlocked || !affordable;
      return `
        <div class="city-upgrade-row ${maxed ? 'city-upgrade-row--maxed' : ''}">
          <div class="city-upgrade-main">
            <div class="city-upgrade-title">${u.label}${rankLabel}</div>
            <div class="city-upgrade-desc">${maxed ? 'Osiągnięto maks. poziom.' : u.describe(nextRank)}</div>
            <div class="city-upgrade-ranks">
              ${renderRankPips(r, u.maxRank)}
            </div>
          </div>
          <button class="city-upgrade-buy" data-upgrade="${u.id}"${buyDisabled ? ' disabled' : ''}>${buyLabel}</button>
        </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="city-panel">
        <div class="city-panel-header">
          <div class="city-panel-icon">${branch.icon}</div>
          <div class="city-panel-title">${branch.label}</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij">×</button>
        </div>
        <div class="city-challenge">
          <div class="city-challenge-label">Wyzwanie: ${status.label}</div>
          <div class="city-challenge-body">${challengeBody}</div>
        </div>
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
        if (u.buy()) {
          // Re-render so gold, rank pips and buy-button state update.
          this.render(branch);
        }
      });
    });
  }
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
