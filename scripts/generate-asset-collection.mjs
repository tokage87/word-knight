import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const spritesRoot = path.join(repoRoot, "sprites");
const outputPath = path.join(repoRoot, "asset_collection.html");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".aseprite", ".zip"]);

const sectionOrder = [
  "Units",
  "Buildings",
  "Enemies",
  "Enemy Avatars",
  "Factions",
  "Resources",
  "Terrain",
  "Effects",
  "Particle FX",
  "UI",
  "UI Elements",
  "Deco",
];

const motionHints = [
  "run",
  "walk",
  "move",
  "attack",
  "shoot",
  "throw",
  "heal",
  "idle",
  "guard",
  "bounce",
  "bouncing",
  "spin",
  "spinning",
  "explosion",
  "fire",
  "spawn",
  "construction",
  "windup",
  "recovery",
  "dead",
  "row",
  "fuselit",
  "active",
];

const staticPenaltyHints = [
  "projectile",
  "arrow",
  "bone",
  "highlight",
  "disable",
  "disabled",
  "pressed",
  "shadow",
  "slots",
  "fill",
  "connection",
  "noshadow",
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function humanList(items) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function titleCase(value) {
  return value
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanStem(fileName) {
  const safeName = typeof fileName === "string" ? fileName : "Asset";
  const stem = safeName.replace(path.extname(safeName), "");
  return titleCase(
    stem
      .replaceAll(/\(.*?\)/g, "")
      .replaceAll(/\b(NoShadow|No Arms|NoArms)\b/gi, "")
      .replaceAll(/\s+/g, " ")
      .trim(),
  );
}

function isAssetFile(name) {
  return assetExtensions.has(path.extname(name).toLowerCase()) && !name.startsWith(".");
}

function isImageFile(name) {
  return imageExtensions.has(path.extname(name).toLowerCase()) && !name.startsWith(".");
}

function readEntries(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function collectGroups(dir, relativeParts = [], groups = []) {
  const entries = readEntries(dir);
  const files = entries.filter((entry) => entry.isFile() && isAssetFile(entry.name));

  if (files.length > 0) {
    groups.push(makeGroup(relativeParts, files));
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectGroups(path.join(dir, entry.name), [...relativeParts, entry.name], groups);
    }
  }

  return groups;
}

function pickFile(files, scorer) {
  return [...files]
    .sort((left, right) => {
      const scoreDiff = scorer(right.name) - scorer(left.name);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true });
    })
    .at(0);
}

function scoreStaticFile(fileName) {
  const lower = fileName.toLowerCase();
  let score = 0;

  if (lower.includes("idle")) score += 120;
  if (lower.includes("regular")) score += 110;
  if (lower.includes("base")) score += 100;
  if (lower.includes("banner")) score += 40;
  if (lower.includes("castle")) score += 30;
  if (lower.includes("house")) score += 30;
  if (lower.includes("tower")) score += 30;
  if (lower.includes("tree")) score += 25;
  if (lower.includes("resource")) score += 25;

  if (lower.includes("run")) score -= 30;
  if (lower.includes("walk")) score -= 30;
  if (lower.includes("move")) score -= 30;
  if (lower.includes("attack")) score -= 40;
  if (lower.includes("shoot")) score -= 40;
  if (lower.includes("throw")) score -= 40;
  if (lower.includes("heal")) score -= 35;
  if (lower.includes("guard")) score -= 20;
  if (lower.includes("construction")) score -= 25;
  if (lower.includes("destroyed")) score -= 30;
  if (lower.includes("dead")) score -= 40;

  for (const hint of staticPenaltyHints) {
    if (lower.includes(hint)) score -= 25;
  }

  return score;
}

function scoreMotionFile(fileName) {
  const lower = fileName.toLowerCase();
  let score = -1000;

  if (lower.includes("run")) score = 180;
  else if (lower.includes("walk")) score = 175;
  else if (lower.includes("move")) score = 170;
  else if (lower.includes("attack")) score = 165;
  else if (lower.includes("shoot")) score = 160;
  else if (lower.includes("throw")) score = 155;
  else if (lower.includes("heal")) score = 150;
  else if (lower.includes("idle")) score = 145;
  else if (lower.includes("guard")) score = 140;
  else if (lower.includes("bounce") || lower.includes("spinning")) score = 138;
  else if (lower.includes("explosion") || lower.includes("fire")) score = 136;
  else if (lower.includes("spawn")) score = 134;
  else if (lower.includes("construction")) score = 132;
  else if (lower.includes("windup") || lower.includes("recovery")) score = 128;
  else if (lower.includes("dead")) score = 126;
  else if (lower.includes("active")) score = 122;

  if (lower.includes("projectile")) score -= 60;
  if (lower.includes("arrow")) score -= 80;
  if (lower.includes("bone")) score -= 80;
  if (lower.includes("highlight")) score -= 60;
  if (lower.includes("pressed")) score -= 70;
  if (lower.includes("disable")) score -= 80;

  return score;
}

function detectTraits(fileNames) {
  const joined = fileNames.join(" ").toLowerCase();
  const traits = [];

  const checks = [
    ["idle", "idle"],
    ["run", "run"],
    ["walk", "walk"],
    ["move", "move"],
    ["bounce", "bounce"],
    ["spinning", "spin"],
    ["attack", "attack"],
    ["shoot", "shoot"],
    ["throw", "throw"],
    ["guard", "guard"],
    ["heal", "heal"],
    ["hit", "hit"],
    ["windup", "windup"],
    ["recovery", "recovery"],
    ["dead", "death"],
    ["projectile", "projectile"],
    ["arrow", "arrow projectile"],
    ["bone", "bone projectile"],
    ["explosion", "explosion"],
    ["fire", "fire"],
    ["spawn", "spawn"],
    ["active", "active"],
    ["grass", "grazing"],
    ["fuselit", "lit fuse"],
    ["construction", "construction"],
    ["destroyed", "destroyed"],
    ["highlight", "highlight"],
    ["pressed", "pressed"],
    ["disable", "disabled"],
    ["fill", "fill"],
    ["slots", "slot overlay"],
  ];

  for (const [needle, label] of checks) {
    if (joined.includes(needle)) {
      traits.push(label);
    }
  }

  return traits;
}

function makeGroup(relativeParts, files) {
  const imageFiles = files.filter((file) => isImageFile(file.name));
  const staticFile = imageFiles.length > 0 ? pickFile(imageFiles, scoreStaticFile) : null;
  const motionFile = imageFiles.length > 0 ? pickFile(imageFiles, scoreMotionFile) : null;

  const staticPath = staticFile ? path.posix.join("sprites", ...relativeParts, staticFile.name) : null;
  const motionPath = motionFile && scoreMotionFile(motionFile.name) > 0 ? path.posix.join("sprites", ...relativeParts, motionFile.name) : null;
  const title = relativeParts.at(-1) ?? "Sprites";
  const section = relativeParts[0] ?? "Misc";
  const relativePath = relativeParts.join(" / ");
  const fileNames = files.map((file) => file.name);
  const description = describeGroup(relativeParts, fileNames);

  return {
    key: relativeParts.join("__").toLowerCase().replaceAll(/\s+/g, "-"),
    section,
    title,
    relativePath,
    shortPath: relativeParts.slice(1).join(" / ") || relativeParts[0] || "Sprites",
    staticPath,
    staticFile: staticFile?.name ?? null,
    motionPath,
    motionFile: motionPath ? motionFile?.name ?? null : null,
    files: fileNames,
    description,
    searchText: [
      relativeParts.join(" "),
      fileNames.join(" "),
      description,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function describeGroup(parts, fileNames) {
  const [section, second, third, fourth, fifth] = parts;
  const title = parts.at(-1) ?? "asset set";
  const traits = detectTraits(fileNames);
  const traitText = traits.length > 0 ? ` with ${humanList(traits)} variants` : "";

  if (section === "Units") {
    if (second === "Units (aseprite in Blue only)") {
      return `Editable Aseprite source files for the base blue unit roster.`;
    }

    const color = second?.replace(" Units", "") ?? "";
    switch (third) {
      case "Archer":
        return `${color} archer unit with idle, run, shoot, and separate arrow assets.`;
      case "Lancer":
        return `${color} lancer unit with directional defence and attack strips plus a run cycle.`;
      case "Monk":
        return `${color} monk support unit with idle, run, heal, and healing effect strips.`;
      case "Pawn":
        return `${color} worker pawn with idle and run cycles, plus tool and carried-resource variants.`;
      case "Warrior":
        return `${color} warrior melee unit with idle, run, guard, and two attack strips.`;
      default:
        return `${cleanStem(title)} unit set${traitText}.`;
    }
  }

  if (section === "Buildings") {
    const color = second?.replace(" Buildings", "") ?? cleanStem(title);
    return `${color} building lineup with castle, barracks, archery, tower, monastery, and house variants.`;
  }

  if (section === "Enemies") {
    if (second === "The Salty Scallyfins") {
      const actor = cleanStem(third ?? title);
      return `Pirate-themed enemy set for ${actor.toLowerCase()}${traitText}.`;
    }
    return `${cleanStem(title)} enemy set${traitText}.`;
  }

  if (section === "Enemy Avatars") {
    return `Portrait icons for enemy roster, dialogue, or HUD use.`;
  }

  if (section === "Resources") {
    if (second === "Gold Mine") {
      return `Gold mine resource with inactive, active, and destroyed states.`;
    }
    if (second === "Resources") {
      return `Loose world resources for gold, meat, and wood with spawn and idle variants.`;
    }
    if (second === "Sheep") {
      return `Happy sheep resource set with idle, bounce, and all-in-one strips.`;
    }
    if (second === "Trees") {
      return `Single tree resource sprite with editable source.`;
    }
  }

  if (section === "Terrain") {
    if (second === "Tileset") {
      return `Ground and water tilesheets with foam, background color, and shadow overlays.`;
    }
    if (second === "Decorations" && third === "Bushes") {
      return `Bush decoration set with four hand-placed variants.`;
    }
    if (second === "Decorations" && third === "Clouds") {
      return `Cloud decoration set with eight sky-ready variants.`;
    }
    if (second === "Decorations" && third === "Rocks") {
      return `Rock decoration set with four standalone variants.`;
    }
    if (second === "Decorations" && third === "Rocks in the Water") {
      return `Water rock props with four variants and matching Aseprite source files.`;
    }
    if (second === "Decorations" && third === "Rubber Duck") {
      return `Novelty water prop with a matching editable source file.`;
    }
    if (second === "Resources" && third === "Gold" && fourth === "Gold Resource") {
      return `Harvestable gold node with regular and highlighted states.`;
    }
    if (second === "Resources" && third === "Gold" && fourth === "Gold Stones") {
      return `Gold stone cluster variants with highlight versions for selection feedback.`;
    }
    if (second === "Resources" && third === "Meat" && fourth === "Meat Resource") {
      return `Static meat pickup for harvesting or loot placement.`;
    }
    if (second === "Resources" && third === "Meat" && fourth === "Sheep") {
      return `Harvestable sheep with idle, grazing, and move-oriented strips.`;
    }
    if (second === "Resources" && third === "Tools") {
      return `Loose tool props for dressing work areas or gatherer scenes.`;
    }
    if (second === "Resources" && third === "Wood" && fourth === "Wood Resource") {
      return `Static wood pickup resource for chopped-tree output.`;
    }
    if (second === "Resources" && third === "Wood" && fourth === "Trees") {
      return `Choppable tree set with four trees, four stumps, and source art.`;
    }
  }

  if (section === "Effects") {
    if (second === "Explosion") {
      return `Explosion strip for hits, bombs, or destruction beats.`;
    }
    if (second === "Fire") {
      return `Looping fire strip for torches, braziers, or spell effects.`;
    }
  }

  if (section === "Particle FX") {
    return `Loose particle sheets for fire, dust, explosions, and water splash moments.`;
  }

  if (section === "UI") {
    if (second === "Banners") {
      return `Banner panels and connector pieces for flexible fantasy UI layouts.`;
    }
    if (second === "Buttons") {
      return `Fantasy buttons in blue, red, and disabled styles, including 3-slice and 9-slice variants.`;
    }
    if (second === "Icons") {
      return `Icon set with regular, pressed, and disabled states.`;
    }
    if (second === "Pointers") {
      return `Pointer markers for selection, targeting, or hover feedback.`;
    }
    if (second === "Ribbons") {
      return `Ribbon UI set with left, right, up, and down connectors in multiple colors.`;
    }
  }

  if (section === "UI Elements") {
    if (second === "UI Banners from the store page" && third === "Banner") {
      return `Store-style banner panel with matching slot overlay.`;
    }
    if (second === "UI Banners from the store page" && third === "Ribbons") {
      return `Store-style ribbon color variants for promo labels or tabs.`;
    }
    if (second === "UI Elements" && third === "Banners") {
      return `Compact fantasy banner with a slots companion overlay.`;
    }
    if (second === "UI Elements" && third === "Bars") {
      return `Big and small bar bases with matching fill sprites.`;
    }
    if (second === "UI Elements" && third === "Buttons") {
      return `Standalone round, square, big, and tiny button variants in red and blue.`;
    }
    if (second === "UI Elements" && third === "Cursors") {
      return `Cursor alternatives for pointer, interact, or target states.`;
    }
    if (second === "UI Elements" && third === "Human Avatars") {
      return `Human portrait set for dialogue, roster, or profile UI.`;
    }
    if (second === "UI Elements" && third === "Icons") {
      return `Clean fantasy icons for inventories, actions, or HUD labels.`;
    }
    if (second === "UI Elements" && third === "Papers") {
      return `Paper card backings for notes, quests, or popup panels.`;
    }
    if (second === "UI Elements" && third === "Ribbons") {
      return `Large and small ribbon sheets for headings, rewards, or badges.`;
    }
    if (second === "UI Elements" && third === "Swords") {
      return `Crossed-swords motif for combat labels or battle markers.`;
    }
    if (second === "UI Elements" && third === "Wood Table") {
      return `Wood table UI panel with a matching slots overlay.`;
    }
  }

  if (section === "Deco") {
    return `General decorative prop sheet with standalone environment pieces.`;
  }

  if (section === "Factions") {
    if (second === "Knights" && third === "Buildings") {
      return `Knight faction ${cleanStem(fourth).toLowerCase()} set with color variants and structural state changes.`;
    }
    if (second === "Knights" && third === "Troops" && fourth === "Archer" && fifth === "Arrow") {
      return `Standalone arrow projectile for knight archer troops.`;
    }
    if (second === "Knights" && third === "Troops" && fourth === "Archer" && fifth === "Archer + Bow") {
      return `Separated archer body-and-bow parts for compositing or recoloring.`;
    }
    if (second === "Knights" && third === "Troops" && fourth === "Dead") {
      return `Death strip for fallen knight troops.`;
    }
    if (second === "Knights" && third === "Troops" && !fifth) {
      return `Knight troop bundle for ${cleanStem(fourth).toLowerCase()} units.`;
    }
    if (second === "Knights" && third === "Troops") {
      return `${cleanStem(fifth).toLowerCase()} knight troop variant for ${cleanStem(fourth).toLowerCase()} units.`;
    }
    if (second === "Goblins" && third === "Buildings" && fourth === "Wood_House") {
      return `Goblin wood house with intact and destroyed states.`;
    }
    if (second === "Goblins" && third === "Buildings" && fourth === "Wood_Tower") {
      return `Goblin wood tower with color variants plus construction and destroyed states.`;
    }
    if (second === "Goblins" && third === "Troops" && fourth === "Barrel") {
      return `${cleanStem(fifth)} goblin barrel troop variant with source art.`;
    }
    if (second === "Goblins" && third === "Troops" && fourth === "TNT" && fifth === "Dynamite") {
      return `Standalone dynamite prop for goblin explosive units.`;
    }
    if (second === "Goblins" && third === "Troops" && fourth === "TNT") {
      return `${cleanStem(fifth)} goblin TNT troop variant with source art.`;
    }
    if (second === "Goblins" && third === "Troops" && fourth === "Torch") {
      return `${cleanStem(fifth)} goblin torch troop variant with source art.`;
    }
    return `${cleanStem(title)} faction asset set${traitText}.`;
  }

  return `${cleanStem(title)} asset set${traitText}.`;
}

function groupBySection(groups) {
  const bucket = new Map();

  for (const group of groups) {
    if (!bucket.has(group.section)) {
      bucket.set(group.section, []);
    }
    bucket.get(group.section).push(group);
  }

  for (const groupsInSection of bucket.values()) {
    groupsInSection.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true }),
    );
  }

  return [...bucket.entries()].sort((left, right) => {
    const leftIndex = sectionOrder.indexOf(left[0]);
    const rightIndex = sectionOrder.indexOf(right[0]);
    const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (safeLeft !== safeRight) {
      return safeLeft - safeRight;
    }
    return left[0].localeCompare(right[0]);
  });
}

function renderPreview(imagePath, fileName, moving = false) {
  if (!imagePath || !fileName) {
    return `<div class="preview-empty">${moving ? "No motion preview" : "Source only"}</div>`;
  }

  return `
    <div class="preview-card">
      <button
        class="preview-trigger"
        type="button"
        data-preview-src="${escapeHtml(imagePath)}"
        data-preview-file="${escapeHtml(fileName)}"
        data-preview-motion="${moving ? "true" : "false"}"
        aria-label="Open ${escapeHtml(fileName)} in the zoom viewer"
      >
        <canvas class="sprite-canvas" data-src="${escapeHtml(imagePath)}" data-file="${escapeHtml(fileName)}" data-motion="${moving ? "true" : "false"}"></canvas>
        <span class="preview-badge">Zoom</span>
      </button>
      <div class="preview-caption">${escapeHtml(fileName)}</div>
    </div>
  `;
}

function renderFileList(group) {
  const fileChips = group.files
    .map((fileName) => {
      const tags = [];
      if (fileName === group.staticFile) {
        tags.push(`<span class="file-tag">static</span>`);
      }
      if (fileName === group.motionFile) {
        tags.push(`<span class="file-tag">motion</span>`);
      }

      return `
        <li class="file-item">
          <code>${escapeHtml(fileName)}</code>
          ${tags.join("")}
        </li>
      `;
    })
    .join("");

  return `
    <div class="file-summary">${group.files.length} file${group.files.length === 1 ? "" : "s"}</div>
    <details class="file-details">
      <summary>Show files</summary>
      <ul class="file-list">${fileChips}</ul>
    </details>
  `;
}

function renderRow(group) {
  return `
    <tr class="asset-row" data-search="${escapeHtml(group.searchText)}">
      <td class="name-cell">
        <div class="asset-name">${escapeHtml(group.title)}</div>
        <div class="asset-path">${escapeHtml(group.relativePath)}</div>
      </td>
      <td class="preview-cell">
        ${renderPreview(group.staticPath, group.staticFile, false)}
      </td>
      <td class="preview-cell">
        ${renderPreview(group.motionPath, group.motionFile, true)}
      </td>
      <td class="files-cell">
        ${renderFileList(group)}
      </td>
      <td class="description-cell">${escapeHtml(group.description)}</td>
    </tr>
  `;
}

function renderSection(section, groups) {
  const sectionId = `section-${section.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return `
    <section id="${sectionId}" class="catalog-section">
      <div class="section-header">
        <div>
          <h2>${escapeHtml(section)}</h2>
          <p>${groups.length} grouped asset set${groups.length === 1 ? "" : "s"}</p>
        </div>
        <a class="top-link" href="#top">Back to top</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset Set</th>
              <th>Asset</th>
              <th>Moving</th>
              <th>Files</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(renderRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

const groups = collectGroups(spritesRoot);
const groupedSections = groupBySection(groups);
const totalFiles = groups.reduce((sum, group) => sum + group.files.length, 0);
const motionCount = groups.filter((group) => group.motionFile).length;

const navItems = groupedSections
  .map(([section, items]) => {
    const sectionId = `section-${section.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
    return `<a class="nav-chip" href="#${sectionId}">${escapeHtml(section)} <span>${items.length}</span></a>`;
  })
  .join("");

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tiny Swords Asset Collection</title>
    <style>
      :root {
        --bg: #f4ecd9;
        --bg-deep: #d6c2a2;
        --paper: rgba(255, 249, 236, 0.9);
        --paper-strong: rgba(255, 252, 244, 0.96);
        --ink: #2a1f16;
        --muted: #6a5645;
        --line: rgba(92, 68, 49, 0.2);
        --accent: #215a5d;
        --accent-strong: #143c3e;
        --gold: #a36d2d;
        --shadow: 0 16px 40px rgba(71, 44, 21, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        color: var(--ink);
        font-family: Georgia, "Palatino Linotype", "Book Antiqua", serif;
        background:
          radial-gradient(circle at top, rgba(255, 255, 255, 0.6), transparent 36%),
          linear-gradient(180deg, #f7f0df 0%, #ebdec4 45%, #d8c19e 100%);
        min-height: 100vh;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(91, 66, 42, 0.06) 1px, transparent 1px),
          linear-gradient(rgba(91, 66, 42, 0.05) 1px, transparent 1px);
        background-size: 22px 22px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), transparent 80%);
      }

      a {
        color: inherit;
      }

      .page {
        width: min(1440px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 80px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        background:
          linear-gradient(135deg, rgba(33, 90, 93, 0.92), rgba(20, 60, 62, 0.94)),
          linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent);
        color: #fff8ee;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 24px;
        padding: 28px;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -80px -120px auto;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 218, 164, 0.22), transparent 72%);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: rgba(255, 248, 238, 0.74);
        font-size: 0.92rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.6rem);
        line-height: 1.05;
      }

      .hero p {
        max-width: 72ch;
        margin: 14px 0 0;
        color: rgba(255, 248, 238, 0.9);
        font-size: 1rem;
        line-height: 1.6;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .stat-card {
        background: rgba(255, 250, 241, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 18px;
        padding: 14px 16px;
        backdrop-filter: blur(6px);
      }

      .stat-card strong {
        display: block;
        font-size: 1.7rem;
        line-height: 1;
      }

      .stat-card span {
        display: block;
        margin-top: 6px;
        color: rgba(255, 248, 238, 0.75);
        font-size: 0.92rem;
      }

      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        margin-top: 20px;
        padding: 16px;
        background: rgba(255, 249, 236, 0.82);
        border: 1px solid rgba(92, 68, 49, 0.15);
        border-radius: 20px;
        box-shadow: 0 18px 40px rgba(92, 68, 49, 0.12);
        backdrop-filter: blur(10px);
      }

      .toolbar-top {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
      }

      .toolbar label {
        display: grid;
        gap: 6px;
        font-size: 0.9rem;
        color: var(--muted);
      }

      .search {
        width: min(360px, 100%);
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(92, 68, 49, 0.2);
        background: rgba(255, 255, 255, 0.85);
        color: var(--ink);
        font: inherit;
      }

      .search:focus {
        outline: 2px solid rgba(33, 90, 93, 0.24);
        border-color: rgba(33, 90, 93, 0.55);
      }

      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .nav-chip {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: var(--paper-strong);
        border: 1px solid rgba(92, 68, 49, 0.16);
        text-decoration: none;
        color: var(--accent-strong);
        font-size: 0.95rem;
        box-shadow: 0 8px 18px rgba(92, 68, 49, 0.08);
      }

      .nav-chip span {
        display: inline-grid;
        place-items: center;
        min-width: 1.7rem;
        padding: 0 0.45rem;
        border-radius: 999px;
        background: rgba(33, 90, 93, 0.12);
        color: var(--accent-strong);
        font-size: 0.82rem;
      }

      .catalog-section {
        margin-top: 26px;
        padding: 22px;
        background: var(--paper);
        border: 1px solid rgba(92, 68, 49, 0.15);
        border-radius: 24px;
        box-shadow: var(--shadow);
        scroll-margin-top: 110px;
      }

      .section-header {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }

      .section-header h2 {
        margin: 0;
        font-size: 1.7rem;
      }

      .section-header p {
        margin: 6px 0 0;
        color: var(--muted);
      }

      .top-link {
        color: var(--accent);
        text-decoration: none;
        font-size: 0.95rem;
      }

      .table-wrap {
        overflow-x: auto;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.42);
      }

      table {
        width: 100%;
        min-width: 1100px;
        border-collapse: collapse;
      }

      thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 14px 12px;
        text-align: left;
        background: rgba(248, 242, 227, 0.96);
        border-bottom: 1px solid var(--line);
        color: var(--accent-strong);
        font-size: 0.92rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      tbody tr:nth-child(odd) {
        background: rgba(255, 255, 255, 0.42);
      }

      tbody tr:nth-child(even) {
        background: rgba(247, 239, 222, 0.55);
      }

      td {
        padding: 14px 12px;
        border-bottom: 1px solid rgba(92, 68, 49, 0.1);
        vertical-align: top;
      }

      .name-cell {
        min-width: 200px;
      }

      .asset-name {
        font-size: 1.08rem;
        font-weight: 700;
      }

      .asset-path {
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.9rem;
        line-height: 1.5;
      }

      .preview-cell {
        width: 150px;
      }

      .preview-card,
      .preview-empty {
        width: 132px;
      }

      .preview-card {
        display: grid;
        gap: 8px;
      }

      .preview-trigger {
        position: relative;
        display: block;
        padding: 0;
        border: 0;
        border-radius: 16px;
        background: transparent;
        cursor: zoom-in;
      }

      .preview-trigger:focus-visible {
        outline: 3px solid rgba(33, 90, 93, 0.26);
        outline-offset: 3px;
      }

      .sprite-canvas,
      .preview-empty {
        width: 132px;
        height: 108px;
        border-radius: 16px;
        border: 1px solid rgba(92, 68, 49, 0.16);
        background:
          linear-gradient(45deg, rgba(255, 255, 255, 0.7) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(255, 255, 255, 0.7) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.7) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.7) 75%),
          linear-gradient(180deg, rgba(225, 212, 188, 0.85), rgba(240, 233, 217, 0.92));
        background-size: 18px 18px;
        background-position: 0 0, 0 9px, 9px -9px, -9px 0;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
      }

      .sprite-canvas {
        display: block;
        image-rendering: pixelated;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          border-color 160ms ease;
      }

      .preview-trigger:hover .sprite-canvas,
      .preview-trigger:focus-visible .sprite-canvas {
        transform: translateY(-1px);
        border-color: rgba(33, 90, 93, 0.32);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.6),
          0 10px 22px rgba(33, 90, 93, 0.18);
      }

      .preview-badge {
        position: absolute;
        right: 8px;
        bottom: 8px;
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(20, 60, 62, 0.86);
        color: #fff8ee;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        pointer-events: none;
      }

      .preview-empty {
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 0.9rem;
        text-align: center;
        padding: 12px;
      }

      .preview-caption {
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.4;
        word-break: break-word;
      }

      .files-cell {
        min-width: 260px;
      }

      .file-summary {
        font-weight: 700;
      }

      .file-details {
        margin-top: 8px;
      }

      .file-details summary {
        cursor: pointer;
        color: var(--accent);
      }

      .file-list {
        display: grid;
        gap: 8px;
        max-height: 220px;
        overflow: auto;
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
      }

      .file-item {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      code {
        padding: 2px 6px;
        border-radius: 8px;
        background: rgba(33, 90, 93, 0.08);
        color: var(--accent-strong);
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.85rem;
      }

      .file-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(163, 109, 45, 0.12);
        color: var(--gold);
        font-size: 0.74rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .description-cell {
        min-width: 260px;
        color: #413226;
        line-height: 1.55;
      }

      .section-hidden {
        display: none;
      }

      .empty-state {
        display: none;
        margin-top: 18px;
        padding: 18px 20px;
        border-radius: 18px;
        background: rgba(255, 249, 236, 0.82);
        border: 1px solid rgba(92, 68, 49, 0.14);
        color: var(--muted);
      }

      .empty-state.is-visible {
        display: block;
      }

      body.lightbox-open {
        overflow: hidden;
      }

      .lightbox[hidden] {
        display: none;
      }

      .lightbox {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 18px;
      }

      .lightbox-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(20, 13, 9, 0.72);
        backdrop-filter: blur(8px);
      }

      .lightbox-panel {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 14px;
        width: min(1220px, 100%);
        height: min(88vh, 920px);
        padding: 18px;
        border-radius: 24px;
        background: rgba(255, 252, 245, 0.98);
        border: 1px solid rgba(92, 68, 49, 0.16);
        box-shadow: 0 26px 80px rgba(20, 13, 9, 0.35);
      }

      .lightbox-header {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: flex-start;
        justify-content: space-between;
      }

      .lightbox-heading {
        min-width: 0;
      }

      .lightbox-heading h3 {
        margin: 0;
        font-size: 1.35rem;
      }

      .lightbox-meta {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 0.94rem;
        line-height: 1.5;
      }

      .lightbox-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .zoom-button,
      .lightbox-close {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(92, 68, 49, 0.16);
        background: rgba(255, 255, 255, 0.86);
        color: var(--accent-strong);
        font: inherit;
        cursor: pointer;
      }

      .zoom-button.is-active {
        background: rgba(33, 90, 93, 0.14);
        border-color: rgba(33, 90, 93, 0.34);
        color: var(--accent-strong);
        font-weight: 700;
      }

      .lightbox-close {
        background: rgba(20, 60, 62, 0.92);
        border-color: rgba(20, 60, 62, 0.92);
        color: #fff8ee;
      }

      .lightbox-stage {
        overflow: auto;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid rgba(92, 68, 49, 0.14);
        background:
          linear-gradient(45deg, rgba(255, 255, 255, 0.78) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(255, 255, 255, 0.78) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.78) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.78) 75%),
          linear-gradient(180deg, rgba(225, 212, 188, 0.86), rgba(240, 233, 217, 0.95));
        background-size: 22px 22px;
        background-position: 0 0, 0 11px, 11px -11px, -11px 0;
      }

      .lightbox-figure {
        display: grid;
        place-items: center;
        min-width: 100%;
        min-height: 100%;
      }

      .lightbox-image {
        display: block;
        max-width: none;
        image-rendering: pixelated;
        box-shadow: 0 18px 40px rgba(20, 13, 9, 0.16);
      }

      .lightbox-help {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 0.88rem;
      }

      @media (max-width: 900px) {
        .page {
          width: min(100% - 20px, 1440px);
          padding-top: 18px;
        }

        .hero,
        .toolbar,
        .catalog-section {
          border-radius: 20px;
        }

        .toolbar-top {
          align-items: stretch;
        }

        .search {
          width: 100%;
        }

        .lightbox {
          padding: 10px;
        }

        .lightbox-panel {
          height: min(92vh, 920px);
          padding: 14px;
          border-radius: 20px;
        }

        .lightbox-stage {
          padding: 12px;
        }
      }
    </style>
  </head>
  <body>
    <main class="page" id="top">
      <section class="hero">
        <p class="eyebrow">Tiny Swords Collection</p>
        <h1>Asset Collection</h1>
        <p>
          This page groups everything found inside <code>sprites</code> into practical sets so you can quickly see
          what is available, preview a representative frame, spot likely animation strips, and jump straight to the
          category you care about.
        </p>
        <div class="stats">
          <div class="stat-card">
            <strong>${groups.length}</strong>
            <span>Grouped asset sets</span>
          </div>
          <div class="stat-card">
            <strong>${groupedSections.length}</strong>
            <span>Top-level sections</span>
          </div>
          <div class="stat-card">
            <strong>${motionCount}</strong>
            <span>Sets with motion preview</span>
          </div>
          <div class="stat-card">
            <strong>${totalFiles}</strong>
            <span>Tracked asset files</span>
          </div>
        </div>
      </section>

      <section class="toolbar">
        <div class="toolbar-top">
          <label>
            Search asset sets, filenames, or descriptions
            <input class="search" id="search" type="search" placeholder="Try: lancer, buttons, goblin, sheep..." />
          </label>
        </div>
        <nav class="nav" aria-label="Section navigation">
          ${navItems}
        </nav>
      </section>

      <div class="empty-state" id="empty-state">
        No matching rows for the current search. Try a broader term like <code>UI</code>, <code>enemy</code>, or <code>pawn</code>.
      </div>

      ${groupedSections.map(([section, items]) => renderSection(section, items)).join("")}
    </main>

    <div class="lightbox" id="lightbox" hidden>
      <div class="lightbox-backdrop" data-close-lightbox></div>
      <section class="lightbox-panel" role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
        <header class="lightbox-header">
          <div class="lightbox-heading">
            <h3 id="lightbox-title">Preview</h3>
            <p class="lightbox-meta" id="lightbox-meta">Loading...</p>
          </div>
          <div class="lightbox-actions">
            <button class="zoom-button" type="button" data-zoom="fit">Fit</button>
            <button class="zoom-button" type="button" data-zoom="1">1x</button>
            <button class="zoom-button" type="button" data-zoom="2">2x</button>
            <button class="zoom-button" type="button" data-zoom="4">4x</button>
            <button class="lightbox-close" type="button" data-close-lightbox>Close</button>
          </div>
        </header>
        <div class="lightbox-stage" id="lightbox-stage">
          <div class="lightbox-figure">
            <img class="lightbox-image" id="lightbox-image" alt="" />
          </div>
        </div>
      </section>
    </div>

    <script>
      const searchInput = document.getElementById("search");
      const rows = [...document.querySelectorAll(".asset-row")];
      const sections = [...document.querySelectorAll(".catalog-section")];
      const emptyState = document.getElementById("empty-state");
      const lightbox = document.getElementById("lightbox");
      const lightboxTitle = document.getElementById("lightbox-title");
      const lightboxMeta = document.getElementById("lightbox-meta");
      const lightboxStage = document.getElementById("lightbox-stage");
      const lightboxImage = document.getElementById("lightbox-image");
      const previewTriggers = [...document.querySelectorAll(".preview-trigger")];
      const zoomButtons = [...document.querySelectorAll(".zoom-button")];
      const lightboxClosers = [...document.querySelectorAll("[data-close-lightbox]")];
      const lightboxState = {
        zoom: "fit",
        scale: 1,
        naturalWidth: 0,
        naturalHeight: 0,
        fileName: "",
        motion: false,
      };

      function applySearch() {
        const term = searchInput.value.trim().toLowerCase();
        let visibleRows = 0;

        rows.forEach((row) => {
          const matches = !term || row.dataset.search.includes(term);
          row.hidden = !matches;
          if (matches) {
            visibleRows += 1;
          }
        });

        sections.forEach((section) => {
          const hasVisibleRows = [...section.querySelectorAll(".asset-row")].some((row) => !row.hidden);
          section.classList.toggle("section-hidden", !hasVisibleRows);
        });

        emptyState.classList.toggle("is-visible", visibleRows === 0);
      }

      searchInput.addEventListener("input", applySearch);
      applySearch();

      const animatedHints = /idle|run|walk|move|attack|shoot|throw|guard|heal|explosion|fire|spawn|construction|bounce|spinning|fuselit|dead|hit|recovery|windup|row|active/i;
      const definitelyStaticHints = /button|banner|ribbon|icon|cursor|paper|table|avatar|pointer|tilemap|slots|fill|shadow|resource|castle|house|tower|barracks|archery|monastery|cloud|rock|bush/i;
      const previews = [];

      function formatZoomLabel(zoom, scale) {
        if (zoom === "fit") {
          return "Fit (" + Math.round(scale * 100) + "%)";
        }
        return zoom + "x";
      }

      function updateLightboxMeta() {
        if (!lightboxState.naturalWidth || !lightboxState.naturalHeight) {
          lightboxMeta.textContent = "Loading image...";
          return;
        }

        const dimensions = lightboxState.naturalWidth + " x " + lightboxState.naturalHeight + "px";
        const sourceKind = lightboxState.motion ? "animation strip source" : "source image";
        const zoomText = formatZoomLabel(lightboxState.zoom, lightboxState.scale);
        lightboxMeta.textContent = dimensions + " • " + sourceKind + " • " + zoomText;
      }

      function applyLightboxZoom(zoom) {
        if (!lightboxState.naturalWidth || !lightboxState.naturalHeight) {
          return;
        }

        let scale = 1;
        if (zoom === "fit") {
          const availableWidth = Math.max(1, lightboxStage.clientWidth - 36);
          const availableHeight = Math.max(1, lightboxStage.clientHeight - 36);
          scale = Math.min(
            availableWidth / lightboxState.naturalWidth,
            availableHeight / lightboxState.naturalHeight,
          );
          scale = Math.max(scale, 0.125);
        } else {
          scale = Number(zoom) || 1;
        }

        lightboxState.zoom = zoom;
        lightboxState.scale = scale;
        lightboxImage.style.width = Math.max(1, Math.round(lightboxState.naturalWidth * scale)) + "px";
        lightboxImage.style.height = Math.max(1, Math.round(lightboxState.naturalHeight * scale)) + "px";

        zoomButtons.forEach((button) => {
          button.classList.toggle("is-active", button.dataset.zoom === zoom);
        });

        updateLightboxMeta();
      }

      function preferredZoom() {
        const availableWidth = Math.max(1, lightboxStage.clientWidth - 36);
        const availableHeight = Math.max(1, lightboxStage.clientHeight - 36);
        const fitScale = Math.min(
          availableWidth / lightboxState.naturalWidth,
          availableHeight / lightboxState.naturalHeight,
        );

        if (fitScale < 0.95) {
          return "fit";
        }
        if (fitScale >= 4) {
          return "4";
        }
        if (fitScale >= 2) {
          return "2";
        }
        return "1";
      }

      function openLightbox({ src, fileName, motion }) {
        lightbox.hidden = false;
        document.body.classList.add("lightbox-open");
        lightboxTitle.textContent = fileName;
        lightboxImage.alt = fileName;
        lightboxMeta.textContent = "Loading image...";
        lightboxStage.scrollTop = 0;
        lightboxStage.scrollLeft = 0;

        lightboxState.fileName = fileName;
        lightboxState.motion = motion;
        lightboxState.naturalWidth = 0;
        lightboxState.naturalHeight = 0;
        lightboxState.zoom = "fit";
        lightboxState.scale = 1;

        zoomButtons.forEach((button) => {
          button.classList.toggle("is-active", button.dataset.zoom === "fit");
        });

        lightboxImage.src = src;
      }

      function closeLightbox() {
        lightbox.hidden = true;
        document.body.classList.remove("lightbox-open");
      }

      function detectFrames(fileName, width, height, motion) {
        if (!width || !height) return 1;
        const ratio = width / height;
        const rounded = Math.round(ratio);
        const looksStrip = Math.abs(ratio - rounded) < 0.001 && rounded >= 2 && rounded <= 16;

        if (!looksStrip) {
          return 1;
        }

        if (motion) {
          return rounded;
        }

        if (animatedHints.test(fileName) && !definitelyStaticHints.test(fileName)) {
          return rounded;
        }

        return 1;
      }

      function fitSprite(frameWidth, frameHeight, boxWidth, boxHeight) {
        const scale = Math.max(0.18, Math.min((boxWidth - 12) / frameWidth, (boxHeight - 12) / frameHeight));
        const drawWidth = Math.max(1, Math.floor(frameWidth * scale));
        const drawHeight = Math.max(1, Math.floor(frameHeight * scale));
        const offsetX = Math.floor((boxWidth - drawWidth) / 2);
        const offsetY = Math.floor((boxHeight - drawHeight) / 2);

        return { drawWidth, drawHeight, offsetX, offsetY };
      }

      function drawPreview(preview, frameIndex = 0) {
        const { canvas, context, image, frames, frameWidth, frameHeight } = preview;
        const boxWidth = canvas.width;
        const boxHeight = canvas.height;
        const { drawWidth, drawHeight, offsetX, offsetY } = fitSprite(frameWidth, frameHeight, boxWidth, boxHeight);

        context.clearRect(0, 0, boxWidth, boxHeight);
        context.imageSmoothingEnabled = false;
        context.drawImage(
          image,
          frameIndex * frameWidth,
          0,
          frameWidth,
          frameHeight,
          offsetX,
          offsetY,
          drawWidth,
          drawHeight,
        );

        if (preview.motion && frames > 1) {
          context.fillStyle = "rgba(20, 60, 62, 0.88)";
          context.beginPath();
          context.roundRect(boxWidth - 54, 8, 46, 22, 11);
          context.fill();
          context.fillStyle = "#fff8ee";
          context.font = "bold 11px Georgia, serif";
          context.fillText("loop", boxWidth - 41, 23);
        }
      }

      function tick(now) {
        previews.forEach((preview) => {
          if (!preview.motion || preview.frames <= 1) {
            return;
          }

          const elapsed = now - preview.startedAt;
          const frame = Math.floor(elapsed / 140) % preview.frames;
          if (frame !== preview.lastFrame) {
            preview.lastFrame = frame;
            drawPreview(preview, frame);
          }
        });

        requestAnimationFrame(tick);
      }

      document.querySelectorAll(".sprite-canvas").forEach((canvas) => {
        const context = canvas.getContext("2d");
        const image = new Image();
        const motion = canvas.dataset.motion === "true";
        const fileName = canvas.dataset.file || "";

        canvas.width = 264;
        canvas.height = 216;

        image.src = canvas.dataset.src;
        image.addEventListener("load", () => {
          const frames = detectFrames(fileName, image.naturalWidth, image.naturalHeight, motion);
          const frameWidth = frames > 1 ? Math.floor(image.naturalWidth / frames) : image.naturalWidth;
          const preview = {
            canvas,
            context,
            image,
            motion,
            frames,
            frameWidth,
            frameHeight: image.naturalHeight,
            startedAt: performance.now(),
            lastFrame: -1,
          };

          previews.push(preview);
          drawPreview(preview, 0);
        });

        image.addEventListener("error", () => {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "rgba(65, 50, 38, 0.72)";
          context.font = "16px Georgia, serif";
          context.textAlign = "center";
          context.fillText("Preview unavailable", canvas.width / 2, canvas.height / 2);
        });
      });

      previewTriggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
          openLightbox({
            src: trigger.dataset.previewSrc,
            fileName: trigger.dataset.previewFile,
            motion: trigger.dataset.previewMotion === "true",
          });
        });
      });

      lightboxImage.addEventListener("load", () => {
        lightboxState.naturalWidth = lightboxImage.naturalWidth;
        lightboxState.naturalHeight = lightboxImage.naturalHeight;
        applyLightboxZoom(preferredZoom());
      });

      lightboxImage.addEventListener("error", () => {
        lightboxMeta.textContent = "Could not load the original image.";
      });

      zoomButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyLightboxZoom(button.dataset.zoom);
        });
      });

      lightboxClosers.forEach((button) => {
        button.addEventListener("click", closeLightbox);
      });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !lightbox.hidden) {
          closeLightbox();
        }
      });

      window.addEventListener("resize", () => {
        if (!lightbox.hidden && lightboxState.zoom === "fit") {
          applyLightboxZoom("fit");
        }
      });

      requestAnimationFrame(tick);
    </script>
  </body>
</html>
`;

fs.writeFileSync(outputPath, html);
console.log(`Wrote ${path.relative(repoRoot, outputPath)} with ${groups.length} asset groups.`);
