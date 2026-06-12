import Phaser from 'phaser';
import { gameEvents } from './events';
import { DomOverlay } from './DomOverlay';
import { escapeAttr } from './escape';
import { STR } from '../i18n/strings';

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

export class SkillPicker extends DomOverlay {
  private onKeyDown = (ev: KeyboardEvent) => this.handleKey(ev);
  private current: SkillCardOption[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 'skill-picker-root', 'skill-picker--visible');
  }

  protected onMount() {
    this.onGameEvent('skillpicker:show', this.show, this);
  }

  private show(options: SkillCardOption[]) {
    if (!this.root) return;
    this.current = options.slice(0, 3);
    this.root.innerHTML = this.render(this.current);
    this.showRoot();
    this.attachWindowKeydown(this.onKeyDown);
    this.root.querySelectorAll<HTMLElement>('.skill-card').forEach((el, i) => {
      el.addEventListener('click', () => this.pick(i));
    });
  }

  private hide() {
    this.hideRoot();
    this.current = [];
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
    gameEvents(this.scene.game).emit('skillpicker:picked', option);
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
        const kindLabel = opt.kind === 'new' ? STR.skillPicker.kindNew : STR.skillPicker.kindUpgrade;
        const weakCls = opt.weakened ? ' skill-card--weak' : '';
        const weakBadge = opt.weakened
          ? `<div class="skill-card-weak-badge">${STR.skillPicker.weakenedBadge}</div>`
          : '';
        // Tooltip on each card: title + description + WEAKENED note.
        // The card already shows desc inline, but the hover tooltip
        // reads better on narrow viewports where the inline text gets
        // truncated. HTML-escape the pieces before inlining into the
        // data-tooltip attribute.
        const tipParts = [opt.title, opt.desc];
        if (opt.weakened) tipParts.push(STR.skillPicker.weakenedTooltip);
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
        <div class="skill-picker-title">${STR.skillPicker.title}</div>
        <div class="skill-picker-subtitle">${STR.skillPicker.subtitle}</div>
        <div class="skill-picker-grid">${cards}</div>
      </div>
    `;
  }
}
