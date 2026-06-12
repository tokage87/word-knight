import Phaser from 'phaser';
import { STR } from '../i18n/strings';

// Plain HTML HUD overlay. Keeps all HUD elements in `#hud-root` in
// index.html and mutates live values per frame from the game registry.
// Positioning is CSS-driven (see src/styles/hud.css).
// Matches Knight.meleeCooldownMs default; earned atk-speed ranks
// trim that down so the displayed "Szybkość ataku" % goes above 100.
const BASE_MELEE_COOLDOWN_MS = 1300;

// Live player stats rendered into the pause panel. Every field is
// optional — rows with missing or default values are elided so the
// pause readout stays tight early-game when few stats have been
// earned yet.
export interface PlayerStats {
  hp?: number;
  hpMax?: number;
  meleeDamage?: number;
  meleeCooldownMs?: number;
  critChance?: number; // 0..1
  armor?: number; // 0..1 (damage-reduction fraction)
  lifesteal?: number; // 0..1
  dodgeChance?: number; // 0..1
  hpRegen?: number; // HP per second
}

export class Hud {
  private root?: HTMLElement;
  private gold?: HTMLElement;
  private hpFill?: HTMLElement;
  private hpText?: HTMLElement;
  private expFill?: HTMLElement;
  // Ally ability slots — the post-rework ability row is entirely
  // companion-driven. Each key is an AllyKind; the values mirror the
  // element refs we need to update per frame.
  private allyIcons: Record<
    string,
    { root: HTMLElement; overlay: HTMLElement; text: HTMLElement; lock?: HTMLElement }
  > = {};
  // Ultimate badge — separate slot to the left of the ally row. Stays
  // hidden until GameScene publishes ultCdBase (i.e. level 10 hit).
  private ultIcon?: { root: HTMLElement; overlay: HTMLElement; text: HTMLElement };
  // Streak / flow chip — small flame next to the EXP bar. Idle when
  // streak < FLOW_THRESHOLD, glowing when in flow.
  private streakChip?: { root: HTMLElement; count: HTMLElement };
  private bossBar?: HTMLElement;
  private bossFill?: HTMLElement;
  private expText?: HTMLElement;
  private hpNum = 100;
  private gold_ = 0;
  // Latest player-stat snapshot, rendered into the pause overlay when
  // the player pauses. Updated on each HUD tick so the pause readout is
  // always current.
  private lastPlayerStats: PlayerStats = {};
  private pauseOverlay?: HTMLElement;
  private pauseStats?: HTMLElement;
  private pauseBtn?: HTMLElement;
  private pauseClickHandler?: () => void;
  private gameOverOverlay?: HTMLElement;
  private gameOverStats?: HTMLElement;
  private gameOverRestart?: HTMLElement;
  private gameOverCity?: HTMLElement;
  private restartClickHandler?: () => void;
  private cityClickHandler?: () => void;
  private pauseResumeBtn?: HTMLElement;
  private pauseCityBtn?: HTMLElement;
  private pauseResumeHandler?: () => void;
  private pauseCityHandler?: () => void;

  mount() {
    const root = document.getElementById('hud-root');
    if (!root) return;
    this.root = root;
    // If the player navigated to City from a paused state (MIASTO on the
    // pause panel), the hud--paused class lingered through unmount. A
    // fresh run must start unpaused — otherwise every hud section stays
    // hidden by the .hud--paused CSS while only quiz-root shows.
    root.classList.remove('hud--paused');
    root.innerHTML = HTML;
    this.pauseOverlay = root.querySelector<HTMLElement>('.pause-overlay') ?? undefined;
    this.pauseStats = root.querySelector<HTMLElement>('.pause-stats') ?? undefined;
    this.pauseBtn = root.querySelector<HTMLElement>('.pause-btn') ?? undefined;
    this.gameOverOverlay = root.querySelector<HTMLElement>('.gameover-overlay') ?? undefined;
    this.gameOverStats = root.querySelector<HTMLElement>('.gameover-stats') ?? undefined;
    this.gameOverRestart = root.querySelector<HTMLElement>('.gameover-restart') ?? undefined;
    this.gameOverCity = root.querySelector<HTMLElement>('.gameover-city') ?? undefined;

    this.gold = root.querySelector<HTMLElement>('.gold-count') ?? undefined;
    this.hpFill = root.querySelector<HTMLElement>('.bar-hp-fill') ?? undefined;
    this.hpText = root.querySelector<HTMLElement>('.bar-hp-text') ?? undefined;
    this.expFill = root.querySelector<HTMLElement>('.bar-exp-fill') ?? undefined;
    this.bossBar = root.querySelector<HTMLElement>('.boss-bar') ?? undefined;
    this.bossFill = root.querySelector<HTMLElement>('.boss-fill') ?? undefined;
    this.expText = root.querySelector<HTMLElement>('.bar-exp-text') ?? undefined;

    this.pauseResumeBtn = root.querySelector<HTMLElement>('.pause-resume') ?? undefined;
    this.pauseCityBtn = root.querySelector<HTMLElement>('.pause-city') ?? undefined;

    // Ally ability slots — the in-tree rework replaced the old spell
    // slots (fire/ice/heal) with companions, so the ability row is
    // entirely ally-driven now. Each slot shows the same sweep+text
    // cooldown pattern as the old spell slots used.
    const allyKinds = [
      'fire-archer',
      'fire-monk',
      'ice-archer',
      'ice-monk',
      'cleric',
      'wind-monk',
      'wind-lancer',
      'earth-pawn',
      'earth-lancer',
    ] as const;
    allyKinds.forEach((kind) => {
      const ic = root.querySelector<HTMLElement>(`.ability[data-ally="${kind}"]`);
      if (!ic) return;
      const overlay = ic.querySelector<HTMLElement>('.ability-cd-overlay')!;
      const text = ic.querySelector<HTMLElement>('.ability-cd-text')!;
      const lock = ic.querySelector<HTMLElement>('.ability-lock') ?? undefined;
      this.allyIcons[kind] = { root: ic, overlay, text, lock };
    });

    const ult = root.querySelector<HTMLElement>('.ability[data-role="ult"]');
    if (ult) {
      this.ultIcon = {
        root: ult,
        overlay: ult.querySelector<HTMLElement>('.ability-cd-overlay')!,
        text: ult.querySelector<HTMLElement>('.ability-cd-text')!,
      };
    }

    const chip = root.querySelector<HTMLElement>('.streak-chip');
    if (chip) {
      this.streakChip = {
        root: chip,
        count: chip.querySelector<HTMLElement>('.streak-count')!,
      };
    }
  }

  tick(registry: Phaser.Data.DataManager) {
    const hp = registry.get('hp') ?? 100;
    const hpMax = registry.get('hpMax') ?? 100;
    this.hpNum = hp;

    if (this.hpFill) this.hpFill.style.width = `${Math.max(0, (hp / hpMax) * 100)}%`;
    if (this.hpText) this.hpText.textContent = `${Math.max(0, Math.floor(hp))} / ${hpMax}`;

    // Gold now persists across runs via MetaStore; the registry is the
    // source of truth. The old `onEnemyKilled` per-run counter is
    // redundant but left alone so the HUD still reacts instantly to
    // kills if the registry tick lags.
    const gold = (registry.get('gold') as number | undefined) ?? 0;
    if (this.gold) this.gold.textContent = `x${gold}`;

    // Stash the live stat snapshot so the pause overlay (which only
    // renders on open) can show the latest numbers without re-running
    // the tick path.
    this.lastPlayerStats = {
      hp,
      hpMax,
      meleeDamage: (registry.get('meleeDamage') as number | undefined) ?? 10,
      meleeCooldownMs: (registry.get('meleeCooldownMs') as number | undefined) ?? BASE_MELEE_COOLDOWN_MS,
      critChance: (registry.get('critChance') as number | undefined) ?? 0,
      armor: (registry.get('armor') as number | undefined) ?? 0,
      lifesteal: (registry.get('lifesteal') as number | undefined) ?? 0,
      dodgeChance: (registry.get('dodgeChance') as number | undefined) ?? 0,
      hpRegen: (registry.get('hpRegen') as number | undefined) ?? 0,
    };

    const level = (registry.get('level') as number | undefined) ?? 1;
    // Ability row is entirely ally-driven after the Tier-2 rework. Loop
    // over every ally slot we know about and let each row manage its
    // locked / ready / cooldown state via the snapshot in the registry.
    (
      [
        'fire-archer',
        'fire-monk',
        'ice-archer',
        'ice-monk',
        'cleric',
        'wind-monk',
        'wind-lancer',
        'earth-pawn',
        'earth-lancer',
      ] as const
    ).forEach((k) => {
      this.updateAlly(registry, k);
    });
    this.updateUlt(registry);
    this.updateStreak(registry);

    const expPct = (registry.get('expPct') as number | undefined) ?? 0;
    if (this.expFill) this.expFill.style.width = `${Math.min(100, expPct)}%`;
    if (this.expText) this.expText.textContent = STR.hud.levelLabel(level);

    const bossAlive = registry.get('bossAlive') as boolean | undefined;
    if (this.bossBar) {
      this.bossBar.classList.toggle('boss-bar--visible', !!bossAlive);
      if (bossAlive && this.bossFill) {
        const bh = registry.get('bossHp') ?? 0;
        const bhm = registry.get('bossHpMax') ?? 1;
        this.bossFill.style.width = `${Math.max(0, (bh / bhm) * 100)}%`;
      }
    }
  }

  // Streak chip: shows the current correct-answer streak. Hidden when
  // the streak is 0; idle (subdued) below the flow threshold; glowing
  // gold when flow is active.
  private updateStreak(registry: Phaser.Data.DataManager) {
    if (!this.streakChip) return;
    const streak = (registry.get('quizStreak') as number | undefined) ?? 0;
    const flowActive = (registry.get('flowActive') as boolean | undefined) ?? false;
    this.streakChip.count.textContent = String(streak);
    this.streakChip.root.classList.toggle('streak-chip--visible', streak > 0);
    this.streakChip.root.classList.toggle('streak-chip--flow', flowActive);
  }

  // One-shot "FLOW!" banner — pops the moment the player crosses the
  // streak threshold (5). Re-fires only after a break and re-build.
  showFlowBanner() {
    if (!this.root) return;
    const banner = document.createElement('div');
    banner.className = 'flow-banner';
    banner.innerHTML = `
      <div class="flow-banner-flame">🔥</div>
      <div class="flow-banner-title">${STR.hud.flowTitle}</div>
      <div class="flow-banner-sub">${STR.hud.flowSub}</div>
    `;
    this.root.appendChild(banner);
    // setTimeout(0) instead of rAF — rAF is throttled to 0 in
    // headless / backgrounded tabs so the in-transition would never
    // run and the banner would stay invisible until removal.
    setTimeout(() => banner.classList.add('flow-banner--in'));
    setTimeout(() => banner.remove(), 1500);
  }

  // One-shot "ULTIMATE GOTOWY!" banner. Wired from UIScene to the
  // GameScene `ult:unlocked` event, which fires the first time the
  // player crosses ULT_UNLOCK_LEVEL in a run. Re-fires on every fresh
  // run since GameScene.create() resets `ultUnlocked` to false.
  showUltUnlockBanner() {
    if (!this.root) return;
    const banner = document.createElement('div');
    banner.className = 'ult-unlock-banner';
    banner.innerHTML = `
      <div class="ult-unlock-title">${STR.hud.ultReadyTitle}</div>
      <div class="ult-unlock-sub">${STR.hud.ultReadySub}</div>
    `;
    this.root.appendChild(banner);
    // setTimeout(0) instead of rAF — rAF is throttled to 0 in
    // headless / backgrounded tabs so the in-transition would never
    // run and the banner would stay invisible until removal.
    setTimeout(() => banner.classList.add('ult-unlock-banner--in'));
    setTimeout(() => banner.remove(), 1800);
  }

  flashCooldownBadge(ms: number) {
    if (!this.root) return;
    const badge = document.createElement('div');
    badge.className = 'cd-badge';
    badge.textContent = `-${ms / 1000}s`;
    this.root.appendChild(badge);
    requestAnimationFrame(() => badge.classList.add('cd-badge--rise'));
    setTimeout(() => badge.remove(), 900);
  }

  setPaused(paused: boolean, stats: Record<string, number> = {}) {
    if (!this.pauseOverlay) return;
    this.pauseOverlay.classList.toggle('pause-overlay--visible', paused);
    // Hide the rest of the HUD (stats, gold, boss bar, equipment,
    // abilities) behind the pause overlay so the dim screen actually
    // reads as "the game is paused" instead of leaking bright chrome
    // through the 72% overlay tint.
    const hudRoot = document.getElementById('hud-root');
    hudRoot?.classList.toggle('hud--paused', paused);
    if (this.pauseBtn) this.pauseBtn.textContent = paused ? '▶' : '⏸';
    if (paused && this.pauseStats) {
      // Each row gets a small Tiny Swords icon chip that matches the
      // meaning of the counter — so the pause readout feels like an
      // in-game ledger rather than a plain debug dump.
      const quizLines: [string, string, number | string][] = [
        ['ico-ok', STR.hud.stats.quizCorrect, stats.quizCorrect ?? 0],
        ['ico-bad', STR.hud.stats.quizWrong, stats.quizWrong ?? 0],
        ['ico-word', STR.hud.stats.distinctWords, stats.distinctWords ?? 0],
        ['ico-sentence', STR.hud.stats.sentenceCorrect, stats.sentenceCorrect ?? 0],
        ['ico-sentence-bad', STR.hud.stats.sentenceWrong, stats.sentenceWrong ?? 0],
        ['ico-story', STR.hud.stats.storiesPerfect, stats.storiesPerfect ?? 0],
        ['ico-story-bad', STR.hud.stats.storiesFailed, stats.storiesFailed ?? 0],
      ];
      const quizHtml = quizLines
        .map(
          ([ico, k, v]) =>
            `<div class="pause-stat-row"><span class="stat-chip ${ico}" aria-hidden="true"></span><span class="pause-stat-label">${k}</span><span class="pause-stat-val">${v}</span></div>`,
        )
        .join('');
      this.pauseStats.innerHTML = quizHtml + this.renderPlayerStatsHtml();
    }
  }

  // Renders the "Twoje statystyki" block shown below quiz stats when
  // paused. Only includes rows that reflect non-default values — the
  // goal is to surface what the player has actually earned, not dump
  // every possible stat on a fresh run.
  private renderPlayerStatsHtml(): string {
    const s = this.lastPlayerStats;
    const rows: string[] = [];
    const push = (ico: string, label: string, value: string) => {
      rows.push(
        `<div class="pause-stat-row"><span class="stat-chip ${ico}" aria-hidden="true"></span><span class="pause-stat-label">${label}</span><span class="pause-stat-val">${value}</span></div>`,
      );
    };

    // HP max — always shown (baseline 100, earned ranks bump it).
    push('ico-heart', STR.hud.stats.hpMax, String(s.hpMax ?? 100));

    // Melee dmg — always shown (baseline 10).
    push('ico-sword', STR.hud.stats.meleeDamage, String(s.meleeDamage ?? 10));

    // Attack speed % — 100% baseline; anything off 100 means a rank
    // was earned.
    if (s.meleeCooldownMs && s.meleeCooldownMs !== BASE_MELEE_COOLDOWN_MS) {
      const pct = Math.round((BASE_MELEE_COOLDOWN_MS / Math.max(1, s.meleeCooldownMs)) * 100);
      push('ico-speed', STR.hud.stats.attackSpeed, `${pct}%`);
    }

    // Earned stats — only show when > 0 to keep the panel tight.
    if ((s.critChance ?? 0) > 0) push('ico-ok', STR.hud.stats.crit, `${Math.round((s.critChance ?? 0) * 100)}%`);
    if ((s.armor ?? 0) > 0) push('ico-armor', STR.hud.stats.armor, `${Math.round((s.armor ?? 0) * 100)}%`);
    if ((s.lifesteal ?? 0) > 0) push('ico-heart', STR.hud.stats.lifesteal, `${Math.round((s.lifesteal ?? 0) * 100)}%`);
    if ((s.dodgeChance ?? 0) > 0) push('ico-ghost', STR.hud.stats.dodge, `${Math.round((s.dodgeChance ?? 0) * 100)}%`);
    if ((s.hpRegen ?? 0) > 0) push('ico-leaf', STR.hud.stats.regen, STR.hud.stats.regenValue(s.hpRegen ?? 0));

    if (rows.length === 0) return '';
    return `
      <div class="pause-stats-divider"></div>
      <div class="pause-stats-heading">${STR.hud.stats.heading}</div>
      ${rows.join('')}
    `;
  }

  onPauseButtonClick(handler: () => void) {
    if (!this.pauseBtn) return;
    if (this.pauseClickHandler) this.pauseBtn.removeEventListener('click', this.pauseClickHandler);
    this.pauseClickHandler = handler;
    this.pauseBtn.addEventListener('click', handler);
  }

  showGameOver(stats: Record<string, number> = {}) {
    if (!this.gameOverOverlay) return;
    this.gameOverOverlay.classList.add('gameover-overlay--visible');
    if (this.gameOverStats) {
      // Same iconified row pattern as the pause panel, with "level
      // reached" pinned to the top and shown with the EXP ribbon chip.
      const lines: [string, string, number | string][] = [
        ['ico-level', STR.hud.stats.level, stats.level ?? 1],
        ['ico-ok', STR.hud.stats.quizCorrect, stats.quizCorrect ?? 0],
        ['ico-bad', STR.hud.stats.quizWrong, stats.quizWrong ?? 0],
        ['ico-word', STR.hud.stats.distinctWords, stats.distinctWords ?? 0],
        ['ico-sentence', STR.hud.stats.sentenceCorrect, stats.sentenceCorrect ?? 0],
        ['ico-sentence-bad', STR.hud.stats.sentenceWrong, stats.sentenceWrong ?? 0],
        ['ico-story', STR.hud.stats.storiesPerfect, stats.storiesPerfect ?? 0],
        ['ico-story-bad', STR.hud.stats.storiesFailed, stats.storiesFailed ?? 0],
      ];
      this.gameOverStats.innerHTML = lines
        .map(
          ([ico, k, v]) =>
            `<div class="gameover-stat-row"><span class="stat-chip ${ico}" aria-hidden="true"></span><span class="gameover-stat-label">${k}</span><span class="gameover-stat-val">${v}</span></div>`,
        )
        .join('');
    }
  }

  hideGameOver() {
    if (!this.gameOverOverlay) return;
    this.gameOverOverlay.classList.remove('gameover-overlay--visible');
  }

  // Called on UIScene shutdown so we don't leak HTML into the next
  // scene (e.g. the Game Over panel persisting on top of the City).
  unmount() {
    if (this.root) this.root.innerHTML = '';
    this.root = undefined;
    this.gameOverOverlay = undefined;
    this.pauseOverlay = undefined;
  }

  onRestartButtonClick(handler: () => void) {
    if (!this.gameOverRestart) return;
    if (this.restartClickHandler) {
      this.gameOverRestart.removeEventListener('click', this.restartClickHandler);
    }
    this.restartClickHandler = handler;
    this.gameOverRestart.addEventListener('click', handler);
  }

  onCityButtonClick(handler: () => void) {
    if (!this.gameOverCity) return;
    if (this.cityClickHandler) {
      this.gameOverCity.removeEventListener('click', this.cityClickHandler);
    }
    this.cityClickHandler = handler;
    this.gameOverCity.addEventListener('click', handler);
  }

  onPauseResumeClick(handler: () => void) {
    if (!this.pauseResumeBtn) return;
    if (this.pauseResumeHandler) {
      this.pauseResumeBtn.removeEventListener('click', this.pauseResumeHandler);
    }
    this.pauseResumeHandler = handler;
    this.pauseResumeBtn.addEventListener('click', handler);
  }

  onPauseCityClick(handler: () => void) {
    if (!this.pauseCityBtn) return;
    if (this.pauseCityHandler) {
      this.pauseCityBtn.removeEventListener('click', this.pauseCityHandler);
    }
    this.pauseCityHandler = handler;
    this.pauseCityBtn.addEventListener('click', handler);
  }

  flashCooldownPenalty(ms: number) {
    if (!this.root) return;
    const badge = document.createElement('div');
    // Red-tinted variant of the cooldown badge (see .cd-badge--penalty
    // in hud.css) so +cooldown reads as "bad" at a glance.
    badge.className = 'cd-badge cd-badge--penalty';
    badge.textContent = `+${ms / 1000}s`;
    this.root.appendChild(badge);
    requestAnimationFrame(() => badge.classList.add('cd-badge--rise'));
    setTimeout(() => badge.remove(), 900);
  }

  onEnemyKilled(payload: { isBoss: boolean }) {
    this.gold_ += payload.isBoss ? 10 : 1;
    if (this.gold) this.gold.textContent = `x${this.gold_}`;
    // EXP bar is now driven from the registry (GameScene tracks level).
  }

  onBossSpawned() {
    // Reserved for entry flash / shake; boss bar visibility is driven
    // by registry 'bossAlive' in tick().
  }

  // Update a companion ability slot. Reads the live cooldown snapshot
  // that GameScene publishes each frame; if the ally hasn't been
  // spawned (tree node not unlocked), the slot shows the padlock.
  private updateAlly(registry: Phaser.Data.DataManager, kind: string) {
    const icon = this.allyIcons[kind];
    if (!icon) return;
    const snapshots =
      (registry.get('allyCooldowns') as
        | Array<{
            allyKind: string;
            remainingMs: number;
            totalMs: number;
          }>
        | undefined) ?? [];
    const snap = snapshots.find((s) => s.allyKind === kind);
    if (!snap) {
      // Not unlocked this run — show the locked state.
      icon.root.classList.add('ability--locked');
      icon.root.classList.remove('ability--ready');
      if (icon.lock) icon.lock.style.display = '';
      icon.overlay.style.height = '100%';
      icon.text.textContent = '';
      return;
    }
    icon.root.classList.remove('ability--locked');
    if (icon.lock) icon.lock.style.display = 'none';
    const frac = snap.totalMs > 0 ? snap.remainingMs / snap.totalMs : 0;
    icon.overlay.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    icon.text.textContent = snap.remainingMs <= 0 ? '' : `${(snap.remainingMs / 1000).toFixed(1)}s`;
    icon.root.classList.toggle('ability--ready', snap.remainingMs <= 0);
    const status = snap.remainingMs <= 0 ? STR.hud.ready : `${(snap.remainingMs / 1000).toFixed(1)}s`;
    const label = ALLY_LABELS[kind] ?? kind;
    const desc = ALLY_DESCS[kind] ?? '';
    icon.root.setAttribute('data-tooltip', STR.hud.allyTooltip(label, desc, (snap.totalMs / 1000).toFixed(0), status));
  }

  // Ultimate badge. Hidden (as locked padlock) until GameScene publishes
  // `ultCdBase` — which happens the first tick after the player hits
  // level ULT_UNLOCK_LEVEL. After that it tracks like any other ability:
  // overlay height = remaining / base, label counts down, ready-glow at 0.
  private updateUlt(registry: Phaser.Data.DataManager) {
    if (!this.ultIcon) return;
    const total = registry.get('ultCdBase') as number | undefined;
    if (total === undefined) {
      this.ultIcon.root.classList.add('ability--locked');
      this.ultIcon.root.classList.remove('ability--ready');
      this.ultIcon.overlay.style.height = '100%';
      this.ultIcon.text.textContent = '';
      return;
    }
    this.ultIcon.root.classList.remove('ability--locked');
    const lock = this.ultIcon.root.querySelector<HTMLElement>('.ability-lock');
    if (lock) lock.style.display = 'none';
    const remaining = (registry.get('ultCdMs') as number | undefined) ?? 0;
    const frac = total > 0 ? remaining / total : 0;
    this.ultIcon.overlay.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.ultIcon.text.textContent = remaining <= 0 ? '' : `${(remaining / 1000).toFixed(0)}s`;
    this.ultIcon.root.classList.toggle('ability--ready', remaining <= 0);
    const status = remaining <= 0 ? STR.hud.ready : `${(remaining / 1000).toFixed(1)}s`;
    this.ultIcon.root.setAttribute('data-tooltip', STR.hud.ultTooltip((total / 1000).toFixed(0), status));
  }

  // Unused; reserved for HP number reads if needed externally.
  getHp(): number {
    return this.hpNum;
  }
}

// Ally labels + short descriptions used by the ability-row tooltip
// (string-indexable views over the typed STR records, since ally kinds
// arrive here as plain strings from the registry snapshot).
const ALLY_LABELS: Record<string, string> = STR.hud.allyLabels;
const ALLY_DESCS: Record<string, string> = STR.hud.allyDescs;
const ALLY_LOCKED_TIPS = STR.hud.allyLockedTooltips;

const HTML = `
  <div class="hud-top-right gold-panel" data-tooltip="${STR.hud.goldTooltip}">
    <span class="gold-ico"></span>
    <span class="gold-count">x0</span>
  </div>

  <div class="hud-top-center boss-bar" data-tooltip="${STR.hud.bossTooltip}">
    <div class="boss-label">${STR.hud.bossLabel}</div>
    <div class="boss-track"><div class="boss-fill"></div></div>
  </div>

  <button type="button" class="pause-btn" data-tooltip="${STR.hud.pauseBtnTooltip}">⏸</button>

  <div class="pause-overlay">
    <div class="pause-panel paper-scroll">
      <div class="panel-title-row">
        <div class="panel-title-icon" aria-hidden="true"></div>
        <div class="pause-title">${STR.hud.pauseTitle}</div>
      </div>
      <div class="pause-sub">${STR.hud.pauseSub}</div>
      <div class="pause-stats"></div>
      <div class="pause-actions">
        <button type="button" class="pause-resume">${STR.hud.resume}</button>
        <button type="button" class="pause-city">${STR.hud.toCity}</button>
      </div>
    </div>
  </div>

  <div class="gameover-overlay">
    <div class="gameover-panel paper-scroll">
      <div class="panel-title-row">
        <div class="panel-title-icon panel-title-icon--fallen" aria-hidden="true"></div>
        <div class="gameover-title">${STR.hud.gameOverTitle}</div>
      </div>
      <div class="gameover-sub">${STR.hud.gameOverSub}</div>
      <div class="gameover-stats"></div>
      <div class="gameover-actions">
        <button type="button" class="gameover-restart">${STR.hud.restart}</button>
        <button type="button" class="gameover-city">${STR.hud.toCity}</button>
      </div>
    </div>
  </div>

  <div class="hud-bottom-center">
    <div class="abilities-row">
      <div class="ability ability--ult ability--locked" data-role="ult" data-tooltip="${STR.hud.ultLockedTooltip}">
        <span class="ability-glyph">⚡</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="fire-archer" data-tooltip="${ALLY_LOCKED_TIPS['fire-archer']}">
        <span class="ability-glyph">🏹</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="fire-monk" data-tooltip="${ALLY_LOCKED_TIPS['fire-monk']}">
        <span class="ability-glyph">🔥</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="ice-archer" data-tooltip="${ALLY_LOCKED_TIPS['ice-archer']}">
        <span class="ability-glyph">❄</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="ice-monk" data-tooltip="${ALLY_LOCKED_TIPS['ice-monk']}">
        <span class="ability-glyph">🧊</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="cleric" data-tooltip="${ALLY_LOCKED_TIPS.cleric}">
        <span class="ability-glyph">✨</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="wind-monk" data-tooltip="${ALLY_LOCKED_TIPS['wind-monk']}">
        <span class="ability-glyph">🌀</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="wind-lancer" data-tooltip="${ALLY_LOCKED_TIPS['wind-lancer']}">
        <span class="ability-glyph">🗡</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="earth-pawn" data-tooltip="${ALLY_LOCKED_TIPS['earth-pawn']}">
        <span class="ability-glyph">🪓</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
      <div class="ability ability--locked" data-ally="earth-lancer" data-tooltip="${ALLY_LOCKED_TIPS['earth-lancer']}">
        <span class="ability-glyph">🪨</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
      </div>
    </div>

    <div class="bars-col">
      <div class="bar-line" data-tooltip="${STR.hud.hpTooltip}">
        <span class="bar-ico bar-ico-img ico-heart"></span>
        <div class="bar-track bar-hp"><div class="bar-fill bar-hp-fill"></div><span class="bar-text bar-hp-text">100 / 100</span></div>
      </div>
      <div class="bar-line" data-tooltip="${STR.hud.expTooltip}">
        <span class="bar-ico bar-badge badge-exp">${STR.hud.expBadge}</span>
        <div class="bar-track bar-exp"><div class="bar-fill bar-exp-fill"></div><span class="bar-text bar-exp-text">${STR.hud.levelLabel(1)}</span></div>
        <div class="streak-chip" data-tooltip="${STR.hud.streakTooltip}">
          <span class="streak-flame">🔥</span>
          <span class="streak-count">0</span>
        </div>
      </div>
    </div>
  </div>
`;
