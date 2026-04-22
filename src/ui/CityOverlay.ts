import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchDef, type BranchId, gateCta } from '../systems/CityBranches';
import { metaStore } from '../systems/MetaStore';
import { SkillTreeView } from './SkillTreeView';

// HTML overlay for the City's branch-detail view. Lives in
// #city-overlay-root. Opens on `city:branchClick`, renders the
// unlock-gate CTA (if locked) or the skill-tree (if unlocked).
// Pure DOM — the Phaser city scene beneath keeps animating.
export class CityOverlay {
  private root?: HTMLElement;
  private tree?: SkillTreeView;
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

  // Re-render the city panel when a gate unlocks a branch, so the
  // student sees the skill tree immediately.
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
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('city-overlay-root') ?? undefined;
    }
    if (!this.root) return;
    this.render(branch);
    this.root.classList.add('city-overlay--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private hide() {
    if (!this.root) return;
    this.root.classList.remove('city-overlay--visible');
    this.root.innerHTML = '';
    this.tree = undefined;
    window.removeEventListener('keydown', this.onKey);
  }

  private render(branch: BranchDef) {
    if (!this.root) return;
    // Defensive: if a prior gate task left the writing-task overlay
    // visible (e.g. player canceled then navigated back), it would sit
    // on top of this panel at z-index 80 and silently eat every click.
    // Clear it before rendering so CTA buttons are reachable.
    const wtRoot = document.getElementById('writing-task-root');
    if (wtRoot) {
      wtRoot.classList.remove('writing-task--visible');
      wtRoot.innerHTML = '';
    }
    const unlocked = branch.isUnlocked();
    const gold = metaStore.getGold();
    const cta = gateCta(branch.id);

    const challengeBlock = unlocked
      ? `<div class="city-challenge">
           <div class="city-challenge-label">Drzewo umiejętności odblokowane</div>
           <div class="city-challenge-body"><span class="city-challenge-done">✓ Odblokowane</span></div>
         </div>`
      : `<div class="city-challenge">
           <div class="city-challenge-label">Wyzwanie:</div>
           <div class="city-challenge-body"><b>${escapeHtml(cta.sublabel)}</b></div>
           <button class="city-task-start" type="button" data-branch="${branch.id}">
             <span class="wt-chip wt-chip--ai" aria-hidden="true"></span><span>${escapeHtml(cta.label)}</span>
           </button>
         </div>`;

    const bodyBlock = unlocked
      ? `<div class="city-tree-host" data-branch="${branch.id}"></div>`
      : `<div class="city-tree-locked-hint">Odblokuj to wyzwanie, żeby zobaczyć drzewo umiejętności.</div>`;

    this.root.innerHTML = `
      <div class="city-panel paper-scroll">
        <div class="city-panel-header">
          <div class="city-panel-icon-slot"><span class="city-panel-icon">${branch.icon}</span></div>
          <div class="city-panel-title">${escapeHtml(branch.label)}</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij"></button>
        </div>
        ${challengeBlock}
        ${bodyBlock}
        <div class="city-panel-footer">
          <span class="city-gold"><span class="city-gold-coin" aria-hidden="true"></span><span class="city-gold-val">${gold}</span></span>
          <button class="city-panel-back" type="button">WRÓĆ</button>
        </div>
      </div>
    `;

    this.root.querySelector('.city-panel-close')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.city-panel-back')!.addEventListener('click', () => this.hide());

    if (unlocked) {
      const host = this.root.querySelector<HTMLElement>('.city-tree-host');
      if (host) {
        this.tree = new SkillTreeView(branch.id, host, () => this.render(branch));
        this.tree.render();
      }
    }
    const startBtn = this.root.querySelector<HTMLButtonElement>('.city-task-start');
    startBtn?.addEventListener('click', () => {
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
