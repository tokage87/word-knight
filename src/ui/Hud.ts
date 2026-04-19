import Phaser from 'phaser';

// Plain HTML HUD overlay. Keeps all HUD elements in `#hud-root` in
// index.html and mutates live values per frame from the game registry.
// Positioning is CSS-driven (see src/styles/hud.css).
export class Hud {
  private root?: HTMLElement;
  private stats?: HTMLElement;
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

  mount() {
    const root = document.getElementById('hud-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = HTML;

    this.stats = root.querySelector<HTMLElement>('.stat-hp-val') ?? undefined;
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
      return;
    }

    const cd = registry.get(`${id}Cd`) ?? 0;
    const base = registry.get(`${id}CdBase`) ?? 1;
    const frac = base > 0 ? cd / base : 0;
    icon.overlay.style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    icon.text.textContent = cd <= 0 ? '' : `${(cd / 1000).toFixed(1)}s`;
    icon.root.classList.toggle('ability--ready', cd <= 0);
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

const HTML = `
  <div class="hud-top-left stat-panel">
    <div class="stat-row"><span class="stat-ico ico-sword"></span><span class="stat-val">48.2</span></div>
    <div class="stat-row"><span class="stat-ico ico-heart"></span><span class="stat-val stat-hp-val">100</span></div>
    <div class="stat-row"><span class="stat-ico ico-speed"></span><span class="stat-val">406%</span></div>
    <div class="stat-row"><span class="stat-ico ico-crit"></span><span class="stat-val">6.19%</span></div>
  </div>

  <div class="hud-top-right gold-panel">
    <span class="gold-ico"></span>
    <span class="gold-count">x0</span>
  </div>

  <div class="hud-top-center boss-bar">
    <div class="boss-label">BOSS</div>
    <div class="boss-track"><div class="boss-fill"></div></div>
  </div>

  <div class="hud-bottom-left equipment-panel">
    <div class="equipment-grid">
      <div class="eq-slot"><img src="assets/ui/Icon_07.png" alt="sword" /></div>
      <div class="eq-slot"><img src="assets/ui/Icon_06.png" alt="shield" /></div>
      <div class="eq-slot empty"></div>
      <div class="eq-slot empty"></div>
    </div>
  </div>

  <div class="hud-bottom-center">
    <div class="abilities-row">
      <div class="ability ability--locked" data-spell="fire">
        <span class="ability-glyph">🔥</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="ice">
        <span class="ability-glyph">❄</span>
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="heal">
        <img class="ability-glyph-img" src="assets/ui/Icon_05.png" alt="heal" />
        <div class="ability-cd-overlay"></div>
        <span class="ability-cd-text"></span>
        <span class="ability-lock">🔒</span>
        <span class="ability-rank"></span>
      </div>
      <div class="ability ability--locked" data-spell="lightning">
        <span class="ability-glyph">⚡</span>
        <span class="ability-lock">🔒</span>
      </div>
    </div>

    <div class="buff-row">
      <div class="buff-box">
        <div class="buff-top"><span class="buff-ico ico-sword"></span><span>16.12%</span></div>
        <div class="buff-sub">30%</div>
      </div>
      <div class="buff-box">
        <div class="buff-top"><span class="buff-ico ico-arrow"></span><span>33.82%</span></div>
        <div class="buff-sub">210%</div>
      </div>
      <div class="buff-box">
        <div class="buff-top"><span class="buff-ico ico-ghost"></span><span>9.27%</span></div>
        <div class="buff-sub">2:00</div>
      </div>
      <div class="buff-box">
        <div class="buff-top"><span class="buff-ico ico-leaf"></span><span>4.56%</span></div>
        <div class="buff-sub">20%</div>
      </div>
    </div>

    <div class="bars-col">
      <div class="bar-line">
        <span class="bar-ico bar-ico-img ico-heart"></span>
        <div class="bar-track bar-hp"><div class="bar-fill bar-hp-fill"></div><span class="bar-text bar-hp-text">100 / 100</span></div>
      </div>
      <div class="bar-line">
        <span class="bar-ico bar-badge badge-exp">EXP</span>
        <div class="bar-track bar-exp"><div class="bar-fill bar-exp-fill"></div><span class="bar-text bar-exp-text">LV: 1</span></div>
      </div>
      <div class="bar-line">
        <span class="bar-ico bar-badge badge-std">STD</span>
        <div class="bar-track bar-std"><div class="bar-fill bar-std-fill" style="width:45%"></div><span class="bar-text">LV: 1</span></div>
      </div>
    </div>
  </div>
`;
