import Phaser from 'phaser';

// Plain HTML HUD overlay. Keeps all HUD elements in `#hud-root` in
// index.html and mutates live values per frame from the game registry.
// Positioning is CSS-driven (see src/styles/hud.css).
const BASE_MELEE_COOLDOWN_MS = 900;

export class Hud {
  private root?: HTMLElement;
  private stats?: HTMLElement;
  private dmgStat?: HTMLElement;
  private spdStat?: HTMLElement;
  private gold?: HTMLElement;
  private hpFill?: HTMLElement;
  private hpText?: HTMLElement;
  private expFill?: HTMLElement;
  private stdFill?: HTMLElement;
  private spellIcons: Record<string, { root: HTMLElement; overlay: HTMLElement; text: HTMLElement; lock?: HTMLElement; rank?: HTMLElement }> = {};
  private bossBar?: HTMLElement;
  private bossFill?: HTMLElement;
  private expText?: HTMLElement;
  private hpNum = 100;
  private gold_ = 0;
  private pauseOverlay?: HTMLElement;
  private pauseStats?: HTMLElement;
  private pauseBtn?: HTMLElement;
  private pauseClickHandler?: () => void;
  private gameOverOverlay?: HTMLElement;
  private gameOverStats?: HTMLElement;
  private gameOverRestart?: HTMLElement;
  private restartClickHandler?: () => void;

  mount() {
    const root = document.getElementById('hud-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = HTML;
    this.pauseOverlay = root.querySelector<HTMLElement>('.pause-overlay') ?? undefined;
    this.pauseStats = root.querySelector<HTMLElement>('.pause-stats') ?? undefined;
    this.pauseBtn = root.querySelector<HTMLElement>('.pause-btn') ?? undefined;
    this.gameOverOverlay = root.querySelector<HTMLElement>('.gameover-overlay') ?? undefined;
    this.gameOverStats = root.querySelector<HTMLElement>('.gameover-stats') ?? undefined;
    this.gameOverRestart = root.querySelector<HTMLElement>('.gameover-restart') ?? undefined;

    this.stats = root.querySelector<HTMLElement>('.stat-hp-val') ?? undefined;
    this.dmgStat = root.querySelector<HTMLElement>('.stat-dmg-val') ?? undefined;
    this.spdStat = root.querySelector<HTMLElement>('.stat-spd-val') ?? undefined;
    this.gold = root.querySelector<HTMLElement>('.gold-count') ?? undefined;
    this.hpFill = root.querySelector<HTMLElement>('.bar-hp-fill') ?? undefined;
    this.hpText = root.querySelector<HTMLElement>('.bar-hp-text') ?? undefined;
    this.expFill = root.querySelector<HTMLElement>('.bar-exp-fill') ?? undefined;
    this.stdFill = root.querySelector<HTMLElement>('.bar-std-fill') ?? undefined;
    this.bossBar = root.querySelector<HTMLElement>('.boss-bar') ?? undefined;
    this.bossFill = root.querySelector<HTMLElement>('.boss-fill') ?? undefined;
    this.expText = root.querySelector<HTMLElement>('.bar-exp-text') ?? undefined;

    (['fire', 'ice', 'heal', 'lightning'] as const).forEach((id) => {
      const ic = root.querySelector<HTMLElement>(`.ability[data-spell="${id}"]`);
      if (!ic) return;
      const overlay = ic.querySelector<HTMLElement>('.ability-cd-overlay')!;
      const text = ic.querySelector<HTMLElement>('.ability-cd-text')!;
      const lock = ic.querySelector<HTMLElement>('.ability-lock') ?? undefined;
      const rank = ic.querySelector<HTMLElement>('.ability-rank') ?? undefined;
      this.spellIcons[id] = { root: ic, overlay, text, lock, rank };
    });

    void this.stdFill;
  }

  tick(registry: Phaser.Data.DataManager) {
    const hp = registry.get('hp') ?? 100;
    const hpMax = registry.get('hpMax') ?? 100;
    this.hpNum = hp;

    if (this.hpFill)
      this.hpFill.style.width = `${Math.max(0, (hp / hpMax) * 100)}%`;
    if (this.hpText)
      this.hpText.textContent = `${Math.max(0, Math.floor(hp))} / ${hpMax}`;
    if (this.stats) this.stats.textContent = String(Math.max(0, Math.floor(hp)));

    const dmg = (registry.get('meleeDamage') as number | undefined) ?? 10;
    const cdMs = (registry.get('meleeCooldownMs') as number | undefined) ?? BASE_MELEE_COOLDOWN_MS;
    if (this.dmgStat) {
      this.dmgStat.textContent = String(dmg);
      this.dmgStat.closest<HTMLElement>('.stat-row')?.setAttribute(
        'data-tooltip',
        `Attack damage\n${dmg} per swing`,
      );
    }
    if (this.spdStat) {
      const pct = Math.round((BASE_MELEE_COOLDOWN_MS / Math.max(1, cdMs)) * 100);
      this.spdStat.textContent = `${pct}%`;
      this.spdStat.closest<HTMLElement>('.stat-row')?.setAttribute(
        'data-tooltip',
        `Attack speed\n${pct}% (${(cdMs / 1000).toFixed(2)}s per swing)`,
      );
    }
    if (this.stats) {
      this.stats.closest<HTMLElement>('.stat-row')?.setAttribute(
        'data-tooltip',
        `HP: ${Math.max(0, Math.floor(hp))} / ${hpMax}`,
      );
    }

    const level = (registry.get('level') as number | undefined) ?? 1;
    const ranks = (registry.get('spellsRank') as Record<string, number> | undefined) ?? {
      fire: 0, ice: 0, heal: 0,
    };
    this.updateSpell(registry, 'fire', ranks.fire ?? 0);
    this.updateSpell(registry, 'ice', ranks.ice ?? 0);
    this.updateSpell(registry, 'heal', ranks.heal ?? 0);
    this.updateLightning();

    const expPct = (registry.get('expPct') as number | undefined) ?? 0;
    if (this.expFill) this.expFill.style.width = `${Math.min(100, expPct)}%`;
    if (this.expText) this.expText.textContent = `LV: ${level}`;

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
    if (this.pauseBtn) this.pauseBtn.textContent = paused ? '▶' : '⏸';
    if (paused && this.pauseStats) {
      const lines: [string, number | string][] = [
        ['Correct quizzes', stats.quizCorrect ?? 0],
        ['Wrong quizzes', stats.quizWrong ?? 0],
        ['Distinct words solved', stats.distinctWords ?? 0],
        ['Sentences (perfect)', stats.sentenceCorrect ?? 0],
        ['Sentences (with mistake)', stats.sentenceWrong ?? 0],
        ['Stories perfect', stats.storiesPerfect ?? 0],
        ['Stories failed', stats.storiesFailed ?? 0],
      ];
      this.pauseStats.innerHTML = lines
        .map(([k, v]) => `<div class="pause-stat-row"><span>${k}</span><span class="pause-stat-val">${v}</span></div>`)
        .join('');
    }
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
      const lines: [string, number | string][] = [
        ['Level reached', stats.level ?? 1],
        ['Correct quizzes', stats.quizCorrect ?? 0],
        ['Wrong quizzes', stats.quizWrong ?? 0],
        ['Distinct words solved', stats.distinctWords ?? 0],
        ['Sentences (perfect)', stats.sentenceCorrect ?? 0],
        ['Sentences (with mistake)', stats.sentenceWrong ?? 0],
        ['Stories perfect', stats.storiesPerfect ?? 0],
        ['Stories failed', stats.storiesFailed ?? 0],
      ];
      this.gameOverStats.innerHTML = lines
        .map(([k, v]) => `<div class="gameover-stat-row"><span>${k}</span><span class="gameover-stat-val">${v}</span></div>`)
        .join('');
    }
  }

  hideGameOver() {
    if (!this.gameOverOverlay) return;
    this.gameOverOverlay.classList.remove('gameover-overlay--visible');
  }

  onRestartButtonClick(handler: () => void) {
    if (!this.gameOverRestart) return;
    if (this.restartClickHandler) {
      this.gameOverRestart.removeEventListener('click', this.restartClickHandler);
    }
    this.restartClickHandler = handler;
    this.gameOverRestart.addEventListener('click', handler);
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

  private updateSpell(
    registry: Phaser.Data.DataManager,
    id: 'fire' | 'ice' | 'heal',
    rank: number,
  ) {
    const icon = this.spellIcons[id];
    if (!icon) return;
    const locked = rank <= 0;

    icon.root.classList.toggle('ability--locked', locked);
    if (icon.lock) icon.lock.style.display = locked ? '' : 'none';
    if (icon.rank) {
      icon.rank.style.display = locked ? 'none' : '';
      icon.rank.textContent = rank > 1 ? toRoman(rank) : '';
    }

    if (locked) {
      icon.overlay.style.height = '100%';
      icon.text.textContent = '';
      icon.root.classList.remove('ability--ready');
      icon.root.setAttribute(
        'data-tooltip',
        `${SPELL_LABEL[id]} — locked.\nLevel up and pick it to unlock.`,
      );
      return;
    }

    const cd = registry.get(`${id}Cd`) ?? 0;
    const base = registry.get(`${id}CdBase`) ?? 1;
    const frac = base > 0 ? cd / base : 0;
    icon.overlay.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    icon.text.textContent = cd <= 0 ? '' : `${(cd / 1000).toFixed(1)}s`;
    icon.root.classList.toggle('ability--ready', cd <= 0);
    const rankStr = rank > 1 ? ` ${toRoman(rank)}` : '';
    const status = cd <= 0 ? 'Ready' : `${(cd / 1000).toFixed(1)}s`;
    icon.root.setAttribute(
      'data-tooltip',
      `${SPELL_LABEL[id]}${rankStr}\n${SPELL_DESC[id]}\nCooldown: ${(base / 1000).toFixed(0)}s · ${status}`,
    );
  }

  private updateLightning() {
    const icon = this.spellIcons['lightning'];
    if (!icon) return;
    // Lightning is intentionally not in the roguelite pool yet — keep it
    // permanently locked with a padlock instead of a level badge.
    icon.root.classList.add('ability--locked');
    if (icon.lock) icon.lock.textContent = '🔒';
  }

  // Unused; reserved for HP number reads if needed externally.
  getHp(): number {
    return this.hpNum;
  }
}

function toRoman(n: number): string {
  return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : String(n);
}

const SPELL_LABEL: Record<'fire' | 'ice' | 'heal', string> = {
  fire: 'Fire',
  ice: 'Ice',
  heal: 'Heal',
};
const SPELL_DESC: Record<'fire' | 'ice' | 'heal', string> = {
  fire: 'AoE burn damage to all enemies on screen.',
  ice: 'Slows and damages the closest enemies.',
  heal: 'Restores HP to the knight.',
};

const HTML = `
  <div class="hud-top-left stat-panel">
    <div class="stat-row" data-tooltip="Attack damage per swing"><span class="stat-ico ico-sword"></span><span class="stat-val stat-dmg-val">10</span></div>
    <div class="stat-row" data-tooltip="Current / max HP"><span class="stat-ico ico-heart"></span><span class="stat-val stat-hp-val">100</span></div>
    <div class="stat-row" data-tooltip="Attack speed (100% = baseline)"><span class="stat-ico ico-speed"></span><span class="stat-val stat-spd-val">100%</span></div>
  </div>

  <div class="hud-top-right gold-panel" data-tooltip="Gold earned from kills">
    <span class="gold-ico"></span>
    <span class="gold-count">x0</span>
  </div>

  <div class="hud-top-center boss-bar" data-tooltip="Boss HP">
    <div class="boss-label">BOSS</div>
    <div class="boss-track"><div class="boss-fill"></div></div>
  </div>

  <button type="button" class="pause-btn" data-tooltip="Pause (P)">⏸</button>

  <div class="pause-overlay">
    <div class="pause-panel">
      <div class="pause-title">PAUSED</div>
      <div class="pause-sub">Press P to resume</div>
      <div class="pause-stats"></div>
    </div>
  </div>

  <div class="gameover-overlay">
    <div class="gameover-panel">
      <div class="gameover-title">GAME OVER</div>
      <div class="gameover-sub">Your run ended — here's how it went</div>
      <div class="gameover-stats"></div>
      <button type="button" class="gameover-restart">RESTART</button>
    </div>
  </div>

  <div class="hud-bottom-left equipment-panel">
    <div class="equipment-grid">
      <div class="eq-slot" data-tooltip="Knight's Sword"><img src="assets/ui/Icon_07.png" alt="sword" /></div>
      <div class="eq-slot" data-tooltip="Knight's Shield"><img src="assets/ui/Icon_06.png" alt="shield" /></div>
      <div class="eq-slot empty"></div>
      <div class="eq-slot empty"></div>
    </div>
  </div>

  <div class="hud-bottom-center">
    <div class="abilities-row">
      <div class="ability ability--locked" data-spell="fire" data-tooltip="Fire — locked. Level up to unlock.">
        <span class="ability-glyph">🔥</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="ice" data-tooltip="Ice — locked. Level up to unlock.">
        <span class="ability-glyph">❄</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="heal" data-tooltip="Heal — locked. Level up to unlock.">
        <img class="ability-glyph-img" src="assets/ui/Icon_05.png" alt="heal" />
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="lightning" data-tooltip="Lightning — not yet implemented.">
        <span class="ability-glyph">⚡</span>
        <span class="ability-lock">🔒</span>
      </div>
    </div>

    <div class="buff-row">
      <div class="buff-box" data-tooltip="Attack buff (placeholder)">
        <div class="buff-top"><span class="buff-ico ico-sword"></span><span>16.12%</span></div>
        <div class="buff-sub">30%</div>
      </div>
      <div class="buff-box" data-tooltip="Ranged buff (placeholder)">
        <div class="buff-top"><span class="buff-ico ico-arrow"></span><span>33.82%</span></div>
        <div class="buff-sub">210%</div>
      </div>
      <div class="buff-box" data-tooltip="Dodge buff (placeholder)">
        <div class="buff-top"><span class="buff-ico ico-ghost"></span><span>9.27%</span></div>
        <div class="buff-sub">2:00</div>
      </div>
      <div class="buff-box" data-tooltip="Regen buff (placeholder)">
        <div class="buff-top"><span class="buff-ico ico-leaf"></span><span>4.56%</span></div>
        <div class="buff-sub">20%</div>
      </div>
    </div>

    <div class="bars-col">
      <div class="bar-line" data-tooltip="Health">
        <span class="bar-ico bar-ico-img ico-heart"></span>
        <div class="bar-track bar-hp"><div class="bar-fill bar-hp-fill"></div><span class="bar-text bar-hp-text">100 / 100</span></div>
      </div>
      <div class="bar-line" data-tooltip="Experience toward next level">
        <span class="bar-ico bar-badge badge-exp">EXP</span>
        <div class="bar-track bar-exp"><div class="bar-fill bar-exp-fill"></div><span class="bar-text bar-exp-text">LV: 1</span></div>
      </div>
      <div class="bar-line" data-tooltip="Study level (placeholder)">
        <span class="bar-ico bar-badge badge-std">STD</span>
        <div class="bar-track bar-std"><div class="bar-fill bar-std-fill" style="width:45%"></div><span class="bar-text">LV: 1</span></div>
      </div>
    </div>
  </div>
`;
