import Phaser from 'phaser';
import { BRANCH_DEFS, type BranchDef, type BranchId, gateCta } from '../systems/CityBranches';
import { metaStore, type WritingSubmission } from '../systems/MetaStore';
import { curriculumCatalog } from '../systems/CurriculumCatalog';
import {
  ALL_CATEGORIES,
  ALL_SOURCES,
  ALL_TIERS,
  CATEGORY_LABELS_PL,
  SOURCE_DESCRIPTIONS_PL,
  SOURCE_LABELS_PL,
  type CurriculumCategory,
  type CurriculumSelection,
  type CurriculumSource,
  type CurriculumTier,
} from '../systems/CurriculumTypes';
import { SkillTreeView } from './SkillTreeView';

// HTML overlay for the City's branch-detail view. Lives in
// #city-overlay-root. Opens on `city:branchClick`, renders the
// unlock-gate CTA (if locked) or the skill-tree (if unlocked).
// Pure DOM — the Phaser city scene beneath keeps animating.
export class CityOverlay {
  private root?: HTMLElement;
  private tree?: SkillTreeView;
  // Draft for the curriculum picker — populated on open, committed by
  // ZAPISZ, discarded on WRÓĆ/Escape.
  private curriculumDraft?: CurriculumSelection;
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
    this.scene.game.events.on('city:openCurriculum', this.onOpenCurriculum, this);
    this.scene.game.events.on('city:stallClick', this.onStallClick, this);
    this.scene.game.events.on('writing:completed', this.onWritingCompleted, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('city:branchClick', this.onBranchClick, this);
      this.scene.game.events.off('city:openJournal', this.onOpenJournal, this);
      this.scene.game.events.off('city:openCurriculum', this.onOpenCurriculum, this);
      this.scene.game.events.off('city:stallClick', this.onStallClick, this);
      this.scene.game.events.off('writing:completed', this.onWritingCompleted, this);
      window.removeEventListener('keydown', this.onKey);
      if (this.root) this.root.innerHTML = '';
    });
  }

  private onOpenCurriculum() {
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('city-overlay-root') ?? undefined;
    }
    if (!this.root) return;
    // Draft state starts as a clone of the persisted selection; edits
    // stay in-memory until the player hits ZAPISZ.
    this.curriculumDraft = { ...curriculumCatalog.getActiveSelection() };
    this.renderCurriculum();
    this.root.classList.add('city-overlay--visible');
    window.addEventListener('keydown', this.onKey);
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

  // Market stall — placeholder content. Real shop arrives once we
  // have items to sell; for now it acknowledges the player's gold and
  // teases what's coming, so the click target isn't a dead end.
  private onStallClick() {
    if (!this.root || !document.body.contains(this.root)) {
      this.root = document.getElementById('city-overlay-root') ?? undefined;
    }
    if (!this.root) return;
    this.renderStall();
    this.root.classList.add('city-overlay--visible');
    window.addEventListener('keydown', this.onKey);
  }

  private renderStall() {
    if (!this.root) return;
    const gold = metaStore.getGold();
    this.root.innerHTML = `
      <div class="city-panel paper-scroll">
        <div class="city-panel-header">
          <div class="city-panel-icon-slot"><span class="city-panel-icon">🪙</span></div>
          <div class="city-panel-title">Targowisko</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="city-challenge">
          <div class="city-challenge-label">Sklep wkrótce</div>
          <div class="city-challenge-body">Kupiec szykuje pierwsze towary. Wpadnij za parę przygód.</div>
        </div>
        <div class="city-tree-locked-hint" style="text-align: center; line-height: 1.6;">
          Złoto zdobywasz pokonując wrogów. Im dłuższe pasmo poprawnych odpowiedzi w quizie, tym szybciej zdobywasz monety dzięki przyspieszonym aliantom.
        </div>
        <div class="city-panel-footer">
          <span class="city-gold"><span class="city-gold-coin" aria-hidden="true"></span><span class="city-gold-val">${gold}</span></span>
          <button class="city-panel-back" type="button">WRÓĆ</button>
        </div>
      </div>
    `;
    this.root.querySelector('.city-panel-close')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.city-panel-back')!.addEventListener('click', () => this.hide());
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

  // ── curriculum picker ──

  private renderCurriculum() {
    if (!this.root || !this.curriculumDraft) return;
    const wtRoot = document.getElementById('writing-task-root');
    if (wtRoot) {
      wtRoot.classList.remove('writing-task--visible');
      wtRoot.innerHTML = '';
    }
    const draft = this.curriculumDraft;
    const summary = curriculumCatalog.summaryFor(draft);

    const sourceRows = ALL_SOURCES.map((s) => {
      const checked = s === draft.source ? 'checked' : '';
      return `
        <label class="cu-source-row">
          <input type="radio" name="cu-source" value="${s}" ${checked} />
          <span class="cu-source-text">
            <span class="cu-source-label">${escapeHtml(SOURCE_LABELS_PL[s])}</span>
            <span class="cu-source-desc">${escapeHtml(SOURCE_DESCRIPTIONS_PL[s])}</span>
          </span>
        </label>
      `;
    }).join('');

    const tierBlock =
      draft.source === 'experimental-tiered'
        ? `<div class="cu-row">
             <div class="cu-row-label">Poziom:</div>
             <div class="cu-tier-row">
               ${ALL_TIERS.map((t) => {
                 const active = draft.tier === t ? 'cu-tier-btn--active' : '';
                 return `<button type="button" class="cu-tier-btn ${active}" data-tier="${t}">${t}</button>`;
               }).join('')}
             </div>
           </div>`
        : '';

    // Legacy data has no category metadata, so the chips would all
    // silently fall back to `all`. Hide the whole row instead of
    // showing dead controls.
    const showCategories = draft.source !== 'legacy';
    const categoryChips = ALL_CATEGORIES.map((c) => {
      const active = c === draft.category ? 'cu-cat-chip--active' : '';
      return `<button type="button" class="cu-cat-chip ${active}" data-cat="${c}">${escapeHtml(CATEGORY_LABELS_PL[c])}</button>`;
    }).join('');
    const categoryBlock = showCategories
      ? `<div class="cu-row">
           <div class="cu-row-label">Kategoria:</div>
           <div class="cu-cat-row">${categoryChips}</div>
         </div>`
      : '';

    this.root.innerHTML = `
      <div class="city-panel city-curriculum-panel paper-scroll">
        <div class="city-panel-header">
          <div class="city-panel-icon-slot"><span class="city-panel-icon">⚙️</span></div>
          <div class="city-panel-title">Ustawienia — Plan nauki</div>
          <button class="city-panel-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="cu-body">
          <div class="cu-row">
            <div class="cu-row-label">Źródło:</div>
            <div class="cu-source-list">${sourceRows}</div>
          </div>
          ${tierBlock}
          ${categoryBlock}
          <div class="cu-summary">
            Aktywna pula: <b>${summary.vocab}</b> słówek ·
            <b>${summary.sentences}</b> zdań ·
            <b>${summary.stories}</b> opowieści
          </div>
        </div>
        <div class="city-panel-footer">
          <button class="cu-save" type="button">ZAPISZ</button>
          <button class="city-panel-back" type="button">WRÓĆ</button>
        </div>
      </div>
    `;

    this.root.querySelector('.city-panel-close')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.city-panel-back')!.addEventListener('click', () => this.hide());

    this.root.querySelectorAll<HTMLInputElement>('input[name="cu-source"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (!this.curriculumDraft) return;
        this.curriculumDraft.source = inp.value as CurriculumSource;
        // Keep a sensible tier whenever switching source. Only tiered
        // actually consumes it, but leaving it undefined would break
        // the picker state on a switch-back to tiered.
        if (this.curriculumDraft.source === 'experimental-tiered' && !this.curriculumDraft.tier) {
          this.curriculumDraft.tier = 1;
        }
        this.renderCurriculum();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.cu-tier-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.curriculumDraft) return;
        this.curriculumDraft.tier = Number(btn.dataset.tier) as CurriculumTier;
        this.renderCurriculum();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.cu-cat-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.curriculumDraft) return;
        this.curriculumDraft.category = btn.dataset.cat as CurriculumCategory;
        this.renderCurriculum();
      });
    });

    this.root.querySelector('.cu-save')!.addEventListener('click', () => {
      if (!this.curriculumDraft) return;
      curriculumCatalog.setSelection({ ...this.curriculumDraft });
      this.hide();
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
