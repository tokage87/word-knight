import type { BranchId } from '../systems/CityBranches';
import { metaStore } from '../systems/MetaStore';
import { SKILL_TREES } from '../systems/SkillTreeDefs';
import type { TreeNode } from '../systems/SkillTree';
import { costAtRank } from '../systems/SkillTreeBalance';

// Hexagonal skill-tree renderer (DOM + SVG). One instance per open
// branch panel — instantiated by CityOverlay.render() and torn down
// automatically when the overlay is closed (host element cleared).
//
// Layout: axial hex coords (q=column, r=row) → pixel (x, y) via a
// flat-top conversion. SVG underlay paints the edges between nodes
// so connections read like the reference image. Each node is a
// <button> absolutely positioned above the SVG. Click → popover with
// cost + description + Buy/Zamknij.

const HEX_DX = 110;    // horizontal distance between adjacent nodes
const HEX_DY = 96;     // vertical distance between rows
const NODE_SIZE = 72;  // rendered node width/height
// Asymmetric padding — horizontal is very generous so hover tooltips
// at edge nodes stay inside the canvas, vertical is tight so the tree
// starts near the top of the panel.
const PADDING_X = 160;
const PADDING_Y = 40;

export class SkillTreeView {
  private popover?: HTMLElement;

  constructor(
    private readonly branchId: BranchId,
    private readonly host: HTMLElement,
    private readonly onChange: () => void,
  ) {}

  render() {
    const tree = SKILL_TREES[this.branchId];
    const gold = metaStore.getGold();

    const positions = new Map<string, { x: number; y: number }>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of tree.nodes) {
      const x = n.position.q * HEX_DX + n.position.r * (HEX_DX / 2);
      const y = n.position.r * HEX_DY;
      positions.set(n.id, { x, y });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const offsetX = PADDING_X - minX;
    const offsetY = PADDING_Y - minY;
    const canvasW = (maxX - minX) + PADDING_X * 2;
    const canvasH = (maxY - minY) + PADDING_Y * 2;

    // Edges: one <line> per edge. Colored brighter when both endpoints
    // have at least rank 1 (i.e. the chain is "lit").
    const edgeLines = tree.edges.map(([from, to]) => {
      const a = positions.get(from); const b = positions.get(to);
      if (!a || !b) return '';
      const fromRank = metaStore.getRank(this.branchId, from);
      const toRank = metaStore.getRank(this.branchId, to);
      const lit = fromRank > 0 && toRank > 0;
      const color = lit ? '#d3a145' : '#5a4428';
      const opacity = lit ? '0.95' : '0.55';
      return `<line x1="${a.x + offsetX}" y1="${a.y + offsetY}" x2="${b.x + offsetX}" y2="${b.y + offsetY}" stroke="${color}" stroke-width="${lit ? 4 : 3}" stroke-opacity="${opacity}" stroke-linecap="round"/>`;
    }).join('');

    const nodeButtons = tree.nodes.map((n) => this.renderNode(n, positions, offsetX, offsetY, gold)).join('');

    this.host.innerHTML = `
      <div class="st-canvas" style="width:${canvasW}px; height:${canvasH}px;">
        <svg class="st-edges" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">${edgeLines}</svg>
        ${nodeButtons}
      </div>
      <div class="st-popover-host"></div>
    `;

    this.host.querySelectorAll<HTMLButtonElement>('.st-node').forEach((btn) => {
      btn.addEventListener('click', () => this.openPopover(btn.dataset.node ?? ''));
      btn.addEventListener('mouseenter', () => btn.classList.add('st-node--hovering'));
      btn.addEventListener('mouseleave', () => btn.classList.remove('st-node--hovering'));
    });
  }

  private renderNode(
    n: TreeNode,
    positions: Map<string, { x: number; y: number }>,
    offsetX: number,
    offsetY: number,
    gold: number,
  ): string {
    const pos = positions.get(n.id)!;
    const rank = metaStore.getRank(this.branchId, n.id);
    const maxed = rank >= n.maxRank;
    const prereqsMet = n.requires.every((req) => {
      const rr = metaStore.getRank(this.branchId, req);
      if (n.requiresMaxed) {
        const reqNode = SKILL_TREES[this.branchId].nodes.find((x) => x.id === req);
        return reqNode ? rr >= reqNode.maxRank : rr > 0;
      }
      return rr > 0;
    });
    const nextCost = maxed ? Infinity : costAtRank(n.costCurve, rank);
    const affordable = !maxed && gold >= nextCost;

    let state: 'maxed' | 'unlockable' | 'locked' | 'poor';
    if (maxed) state = 'maxed';
    else if (!prereqsMet) state = 'locked';
    else if (!affordable) state = 'poor';
    else state = 'unlockable';

    const left = (pos.x + offsetX) - NODE_SIZE / 2;
    const top = (pos.y + offsetY) - NODE_SIZE / 2;

    // Short next-step description shown in the hover tooltip so the
    // student doesn't have to click each node to read its effect.
    const nextDesc = maxed ? 'Maks.' : n.desc(Math.min(rank + 1, n.maxRank));
    const costLine = maxed
      ? 'Maks.'
      : !prereqsMet
        ? 'Zablokowane'
        : `${nextCost} złota`;
    const tooltipText = `${n.label} (${rank}/${n.maxRank})\n${nextDesc}\n${costLine}`;

    // Inline price/state badge — greyed when locked, gold when buyable.
    let badgeHtml = '';
    if (maxed) {
      badgeHtml = '<span class="st-node-badge st-node-badge--max">MAX</span>';
    } else if (!prereqsMet) {
      badgeHtml = '<span class="st-node-badge st-node-badge--locked" aria-hidden="true"></span>';
    } else {
      const affCls = affordable ? 'st-node-badge--cost' : 'st-node-badge--cost st-node-badge--poor';
      badgeHtml = `<span class="st-node-badge ${affCls}"><span class="st-node-badge-coin" aria-hidden="true"></span>${nextCost}</span>`;
    }

    return `
      <button class="st-node st-node--${state}" data-node="${n.id}"
        style="left:${left}px; top:${top}px; width:${NODE_SIZE}px; height:${NODE_SIZE}px;"
        title="${escapeAttr(tooltipText)}">
        ${badgeHtml}
        <img class="st-node-icon" src="${escapeAttr(n.icon)}" alt="" />
        <span class="st-node-rank">${rank}/${n.maxRank}</span>
        <span class="st-node-tooltip">
          <span class="st-tt-title">${escapeHtml(n.label)}</span>
          <span class="st-tt-rank">${rank}/${n.maxRank}</span>
          <span class="st-tt-desc">${escapeHtml(nextDesc)}</span>
          <span class="st-tt-cost">${escapeHtml(costLine)}</span>
        </span>
      </button>
    `;
  }

  private openPopover(nodeId: string) {
    const tree = SKILL_TREES[this.branchId];
    const n = tree.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const rank = metaStore.getRank(this.branchId, nodeId);
    const maxed = rank >= n.maxRank;
    const nextCost = maxed ? 0 : costAtRank(n.costCurve, rank);
    const gold = metaStore.getGold();
    const prereqsMet = n.requires.every((req) => metaStore.getRank(this.branchId, req) > 0);
    const affordable = gold >= nextCost;
    const canBuy = !maxed && prereqsMet && affordable;

    const prereqLines = n.requires.length
      ? `<div class="st-pop-prereq">Wymaga: ${n.requires.map((r) => {
          const rn = tree.nodes.find((x) => x.id === r);
          const rRank = metaStore.getRank(this.branchId, r);
          const ok = rRank > 0;
          return `<span class="st-pop-prereq-item ${ok ? 'ok' : 'missing'}">${escapeHtml(rn?.label ?? r)}</span>`;
        }).join(' · ')}</div>`
      : '';

    const buyBlock = maxed
      ? '<div class="st-pop-max">Osiągnięto maks. poziom.</div>'
      : !prereqsMet
        ? '<div class="st-pop-locked">Najpierw odblokuj wymagane umiejętności.</div>'
        : !affordable
          ? `<div class="st-pop-poor">Potrzebujesz <b>${nextCost}</b> złota. Masz ${gold}.</div>`
          : `<button class="st-pop-buy" type="button">KUP (${nextCost}<span class="st-pop-coin" aria-hidden="true"></span>)</button>`;

    // Remove any existing popover, then mount a new one.
    this.popover?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'st-popover';
    wrap.innerHTML = `
      <div class="st-pop-head">
        <img class="st-pop-icon" src="${escapeAttr(n.icon)}" alt="" />
        <div class="st-pop-title">${escapeHtml(n.label)}<span class="st-pop-rank">${rank}/${n.maxRank}</span></div>
        <button class="st-pop-close" type="button" aria-label="Zamknij">×</button>
      </div>
      <div class="st-pop-body">
        <div class="st-pop-desc">${escapeHtml(n.desc(Math.min(rank + 1, n.maxRank)))}</div>
        ${prereqLines}
        ${buyBlock}
      </div>
    `;
    const popHost = this.host.querySelector<HTMLElement>('.st-popover-host');
    popHost?.appendChild(wrap);
    this.popover = wrap;
    wrap.querySelector('.st-pop-close')?.addEventListener('click', () => {
      this.popover?.remove();
      this.popover = undefined;
    });
    wrap.querySelector('.st-pop-buy')?.addEventListener('click', () => {
      if (!canBuy) return;
      if (!metaStore.spendGold(nextCost)) return;
      metaStore.buyRank(this.branchId, nodeId);
      this.popover?.remove();
      this.popover = undefined;
      // Parent re-renders so gold counter + new state visible.
      this.onChange();
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
