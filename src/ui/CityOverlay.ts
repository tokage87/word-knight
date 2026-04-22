import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchDef, type BranchId, gateCta } from '../systems/CityBranches';
import { metaStore, type WritingSubmission } from '../systems/MetaStore';
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
    this.scene.game.events.on('city:openJournal', this.onOpenJournal, this);
    this.scene.game.events.on('writing:completed', this.onWritingCompleted, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('city:branchClick', this.onBranchClick, this);
      this.scene.game.events.off('city:openJournal', this.onOpenJournal, this);
      this.scene.game.events.off('writing:completed', this.onWritingCompleted, this);
      window.removeEventListener('keydown', this.onKey);
      if (this.root) this.root.innerHTML = '';
    });
  }

  private onOpenJournal() {
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('city-overlay-root') ?? undefined;
    }
    if (!this.root) return;
    this.renderJournal();
    this.root.classList.add('city-overlay--visible');
    window.addEventListener('keydown', this.onKey);
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

  // Renders the parent/teacher journal — every writing submission the
  // student has made, newest first. No gameplay state here, just a
  // read-only review surface. Same defensive wt-root clear as render().
  private renderJournal() {
    if (!this.root) return;
    const wtRoot = document.getElementById('writing-task-root');
    if (wtRoot) {
      wtRoot.classList.remove('writing-task--visible');
      wtRoot.innerHTML = '';
    }
    const submissions = metaStore.getWritingSubmissions();
    const bodyBlock =
      submissions.length === 0
        ? `<div class="city-journal-empty">Ukończ pierwsze wyzwanie, żeby zobaczyć wpisy tutaj.</div>`
        : `<div class="city-journal-list">${submissions.map(renderSubmissionCard).join('')}</div>`;

    const summary =
      submissions.length === 0
        ? 'Brak wpisów'
        : `${submissions.length} ${submissionCountWord(submissions.length)} · ostatni ${relativeTime(submissions[0]!.submittedAt)}`;

    this.root.innerHTML = `
      <div class="city-panel city-journal-panel paper-scroll">
        <div class="city-panel-header">
          <div class="city-panel-icon-slot"><span class="city-panel-icon">📖</span></div>
          <div class="city-panel-title">Dziennik postępów</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="city-journal-summary">${escapeHtml(summary)}</div>
        ${bodyBlock}
        <div class="city-panel-footer">
          <button class="city-panel-back" type="button">WRÓĆ</button>
        </div>
      </div>
    `;

    this.root.querySelector('.city-panel-close')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.city-panel-back')!.addEventListener('click', () => this.hide());

    // Expand/collapse individual cards on click. Default is collapsed
    // so parents can scan the list before diving into one entry.
    this.root.querySelectorAll<HTMLElement>('.city-journal-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't collapse when clicking inside the already-open text (so
        // selections for copy-paste don't trigger a re-render).
        if ((e.target as HTMLElement).closest('.city-journal-text')) return;
        card.classList.toggle('city-journal-card--open');
      });
    });
  }
}

function renderSubmissionCard(s: WritingSubmission): string {
  const branchLabel = BRANCH_DEFS[s.branch]?.label ?? s.branch;
  const when = `${formatAbsoluteDate(s.submittedAt)} · ${relativeTime(s.submittedAt)}`;
  return `
    <div class="city-journal-card">
      <div class="city-journal-card-header">
        <span class="city-journal-branch">${escapeHtml(branchLabel)}</span>
        <span class="city-journal-when">${escapeHtml(when)}</span>
      </div>
      <div class="city-journal-prompt"><b>${escapeHtml(s.prompt)}</b></div>
      <div class="city-journal-meters">
        <span class="city-journal-meter">Słów: <b>${s.wordCount}</b></span>
        <span class="city-journal-meter">Różnych: <b>${s.distinctCount}</b></span>
      </div>
      <div class="city-journal-text">${escapeHtml(s.text)}</div>
    </div>
  `;
}

function submissionCountWord(n: number): string {
  // Polish plural: 1 wpis, 2-4 wpisy, 5+ wpisów. Handles teens
  // correctly (12 wpisów, not 12 wpisy).
  const abs = Math.abs(n);
  if (abs === 1) return 'wpis';
  const last = abs % 10;
  const last2 = abs % 100;
  if (last >= 2 && last <= 4 && (last2 < 12 || last2 > 14)) return 'wpisy';
  return 'wpisów';
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} dni temu`;
  return `${Math.floor(days / 30)} mies. temu`;
}

function formatAbsoluteDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
