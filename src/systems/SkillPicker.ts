import Phaser from 'phaser';

// Roguelite-style level-up picker. Listens for `skillpicker:show` on the
// global event bus and renders up to 3 cards the player chooses between
// with W/E/R or click. Emits `skillpicker:picked` with the chosen card id
// and hides itself.

export interface SkillCardOption {
  key: string;           // unique pick id ("fire.new", "fire.upgrade", …)
  kind: 'new' | 'upgrade';
  title: string;         // "Fire" / "Ice II"
  desc: string;
  icon: string;          // emoji or /assets/ url
  // True when the player made at least one mistake in the level-up
  // sentence/story gate. Upgrade effects for weakened cards are halved
  // (rounded down) on pick. Rendered with a "WEAKENED" badge so the
  // player knows what they're accepting.
  weakened?: boolean;
}

const HOTKEYS = ['w', 'e', 'r'] as const;

export class SkillPicker {
  private root?: HTMLElement;
  private onKeyDown = (ev: KeyboardEvent) => this.handleKey(ev);
  private current: SkillCardOption[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  mount() {
    const root = document.getElementById('skill-picker-root');
    if (!root) return;
    this.root = root;
    root.innerHTML = '';
    root.classList.remove('skill-picker--visible');

    this.scene.game.events.on('skillpicker:show', this.show, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off('skillpicker:show', this.show, this);
      window.removeEventListener('keydown', this.onKeyDown);
    });
  }

  private show(options: SkillCardOption[]) {
    if (!this.root) return;
    this.current = options.slice(0, 3);
    this.root.innerHTML = this.render(this.current);
    this.root.classList.add('skill-picker--visible');
    window.addEventListener('keydown', this.onKeyDown);
    this.root.querySelectorAll<HTMLElement>('.skill-card').forEach((el, i) => {
      el.addEventListener('click', () => this.pick(i));
    });
  }

  private hide() {
    if (!this.root) return;
    this.root.classList.remove('skill-picker--visible');
    this.root.innerHTML = '';
    this.current = [];
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private handleKey(ev: KeyboardEvent) {
    const k = ev.key.toLowerCase();
    const i = HOTKEYS.indexOf(k as (typeof HOTKEYS)[number]);
    if (i >= 0 && i < this.current.length) {
      ev.preventDefault();
      this.pick(i);
    }
  }

  private pick(i: number) {
    const option = this.current[i];
    if (!option) return;
    this.hide();
    this.scene.game.events.emit('skillpicker:picked', option);
  }

  private render(options: SkillCardOption[]): string {
    const cards = options
      .map((opt, i) => {
        const key = HOTKEYS[i]?.toUpperCase() ?? '';
        // Icons may be either an emoji glyph (e.g. "🔥") or a relative
        // image path ending in .png. We use the ".png" suffix as the
        // discriminator so paths stay base-URL-agnostic.
        const iconHtml = opt.icon.endsWith('.png')
          ? `<img class="skill-card-icon-img" src="${opt.icon}" alt="" />`
          : `<span class="skill-card-icon">${opt.icon}</span>`;
        const kindLabel = opt.kind === 'new' ? 'NEW' : 'UPGRADE';
        const weakCls = opt.weakened ? ' skill-card--weak' : '';
        const weakBadge = opt.weakened
          ? '<div class="skill-card-weak-badge">WEAKENED −50%</div>'
          : '';
        // Tooltip on each card: title + description + WEAKENED note.
        // The card already shows desc inline, but the hover tooltip
        // reads better on narrow viewports where the inline text gets
        // truncated. HTML-escape the pieces before inlining into the
        // data-tooltip attribute.
        const tipParts = [opt.title, opt.desc];
        if (opt.weakened) tipParts.push('OSŁABIONE −50%');
        const tooltip = escapeAttr(tipParts.join('\n'));
        return `
          <button class="skill-card skill-card--${opt.kind}${weakCls}" data-i="${i}" data-tooltip="${tooltip}">
            <div class="skill-card-kind">${kindLabel}</div>
            ${weakBadge}
            ${iconHtml}
            <div class="skill-card-title">${opt.title}</div>
            <div class="skill-card-desc">${opt.desc}</div>
            <div class="skill-card-key">${key}</div>
          </button>`;
      })
      .join('');
    return `
      <div class="skill-picker">
        <div class="skill-picker-title">LEVEL UP!</div>
        <div class="skill-picker-subtitle">Choose your reward</div>
        <div class="skill-picker-grid">${cards}</div>
      </div>
    `;
  }
}

// Minimal HTML-attribute escape so a card title / desc with quotes or
// angle brackets can't break the `data-tooltip="…"` wrapper we're
// inlining via a template string.
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
