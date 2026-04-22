import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "Vacab_list.html");

const datasetSpecs = [
  {
    id: "master",
    label: "Master",
    description: "Editable source of truth for the experimental curriculum.",
    root: path.join(repoRoot, "src/data/experimental/master"),
  },
  {
    id: "tiered",
    label: "Tiered Export",
    description: "Generated full export with all three tiers combined.",
    root: path.join(repoRoot, "src/data/experimental/tiered"),
  },
  {
    id: "a2",
    label: "A2 Export",
    description: "Generated CEFR A2 export.",
    root: path.join(repoRoot, "src/data/experimental/cefr/a2"),
  },
  {
    id: "b1",
    label: "B1 Export",
    description: "Generated CEFR B1 export.",
    root: path.join(repoRoot, "src/data/experimental/cefr/b1"),
  },
];

const sectionLabels = {
  vocab: "Vocab",
  sentence: "Sentence",
  story: "Story",
};

const categoryLabels = {
  household: "Household",
  school: "School",
  food_kitchen: "Food / Kitchen",
  animals_nature: "Animals / Nature",
  town_places: "Town / Places",
  fantasy_adventure: "Fantasy / Adventure",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugToLabel(value) {
  if (!value) {
    return "None";
  }
  return String(value)
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCategoryLabel(value) {
  return categoryLabels[value] ?? slugToLabel(value);
}

function tokenJoin(tokens) {
  const safeTokens = tokens.filter(Boolean).map((token) => String(token).trim()).filter(Boolean);
  let output = "";

  for (const token of safeTokens) {
    if (!output) {
      output = token;
      continue;
    }

    if (/^[,.;:!?)]/.test(token)) {
      output += token;
      continue;
    }

    if (/^['’]/.test(token)) {
      output += token;
      continue;
    }

    output += ` ${token}`;
  }

  return output;
}

function stepSentence(steps = []) {
  return tokenJoin(steps.map((step) => step.correct));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function makeBaseRecord(dataset, filePath, kind, entry) {
  return {
    dataset: dataset.id,
    datasetLabel: dataset.label,
    datasetDescription: dataset.description,
    file: path.relative(repoRoot, filePath),
    kind,
    kindLabel: sectionLabels[kind],
    id: entry.id,
    tier: entry.tier ?? null,
    cefr: entry.cefr ?? null,
    category: entry.category ?? null,
    categoryLabel: getCategoryLabel(entry.category),
  };
}

function normalizeVocab(dataset, filePath, entry) {
  const base = makeBaseRecord(dataset, filePath, "vocab", entry);
  return {
    ...base,
    title: entry.en,
    polish: entry.pl,
    english: entry.en,
    summary: `${entry.en} -> ${entry.pl}`,
    distractors: entry.distractors ?? [],
    vocabIds: [],
    storySentences: [],
    searchText: [
      dataset.label,
      base.kindLabel,
      entry.id,
      entry.en,
      entry.pl,
      ...(entry.distractors ?? []),
      entry.category ?? "",
      entry.cefr ?? "",
      entry.tier ?? "",
      path.relative(repoRoot, filePath),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function normalizeSentence(dataset, filePath, entry) {
  const base = makeBaseRecord(dataset, filePath, "sentence", entry);
  const english = stepSentence(entry.steps);
  return {
    ...base,
    title: english,
    polish: entry.pl,
    english,
    summary: english,
    distractors: [],
    vocabIds: entry.vocabIds ?? [],
    steps: entry.steps ?? [],
    storySentences: [],
    searchText: [
      dataset.label,
      base.kindLabel,
      entry.id,
      english,
      entry.pl,
      ...(entry.vocabIds ?? []),
      ...((entry.steps ?? []).flatMap((step) => [step.correct, step.distractor])),
      entry.category ?? "",
      entry.cefr ?? "",
      entry.tier ?? "",
      path.relative(repoRoot, filePath),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function normalizeStory(dataset, filePath, entry) {
  const base = makeBaseRecord(dataset, filePath, "story", entry);
  const storySentences = (entry.sentences ?? []).map((sentence) => ({
    id: sentence.id,
    pl: sentence.pl,
    en: stepSentence(sentence.steps),
  }));
  return {
    ...base,
    title: entry.title,
    polish: storySentences.map((sentence) => sentence.pl).join(" "),
    english: storySentences.map((sentence) => sentence.en).join(" "),
    summary: entry.title,
    distractors: [],
    vocabIds: entry.vocabIds ?? [],
    storySentences,
    sentenceCount: storySentences.length,
    searchText: [
      dataset.label,
      base.kindLabel,
      entry.id,
      entry.title,
      ...(entry.vocabIds ?? []),
      ...storySentences.flatMap((sentence) => [sentence.id, sentence.pl, sentence.en]),
      entry.category ?? "",
      entry.cefr ?? "",
      entry.tier ?? "",
      path.relative(repoRoot, filePath),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function collectRecords() {
  const records = [];

  for (const dataset of datasetSpecs) {
    const vocabPath = path.join(dataset.root, "vocab.json");
    const sentencePath = path.join(dataset.root, "sentences.json");
    const storyPath = path.join(dataset.root, "stories.json");

    for (const entry of loadJson(vocabPath)) {
      records.push(normalizeVocab(dataset, vocabPath, entry));
    }

    for (const entry of loadJson(sentencePath)) {
      records.push(normalizeSentence(dataset, sentencePath, entry));
    }

    for (const entry of loadJson(storyPath)) {
      records.push(normalizeStory(dataset, storyPath, entry));
    }
  }

  return records.sort((left, right) => {
    const datasetDiff = datasetSpecs.findIndex((item) => item.id === left.dataset) - datasetSpecs.findIndex((item) => item.id === right.dataset);
    if (datasetDiff !== 0) {
      return datasetDiff;
    }

    const kindOrder = ["vocab", "sentence", "story"];
    const kindDiff = kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);
    if (kindDiff !== 0) {
      return kindDiff;
    }

    const tierDiff = (left.tier ?? 99) - (right.tier ?? 99);
    if (tierDiff !== 0) {
      return tierDiff;
    }

    const categoryDiff = (left.category ?? "").localeCompare(right.category ?? "");
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return left.id.localeCompare(right.id, undefined, { numeric: true });
  });
}

function buildHtml(records) {
  const safeRecords = JSON.stringify(records).replaceAll("<", "\\u003c");
  const datasetSummary = datasetSpecs
    .map((dataset) => {
      const count = records.filter((record) => record.dataset === dataset.id).length;
      return `
        <article class="summary-card">
          <h3>${escapeHtml(dataset.label)}</h3>
          <p>${escapeHtml(dataset.description)}</p>
          <strong>${count} entries</strong>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vacab List</title>
    <style>
      :root {
        --paper: #f7f1e4;
        --paper-strong: #efe4cf;
        --ink: #2e241c;
        --muted: #6a5a4d;
        --line: rgba(63, 44, 27, 0.16);
        --accent: #1f6f5f;
        --accent-soft: rgba(31, 111, 95, 0.12);
        --gold: #a16d25;
        --shadow: 0 14px 32px rgba(40, 26, 12, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(161, 109, 37, 0.12), transparent 24rem),
          linear-gradient(180deg, #fbf7ef 0%, #f3ead8 100%);
      }

      .shell {
        width: min(1500px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 48px;
      }

      .hero,
      .filters,
      .summary,
      .table-wrap {
        background: rgba(255, 252, 246, 0.92);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: var(--shadow);
      }

      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }

      h1,
      h2,
      h3 {
        margin: 0;
        font-weight: 700;
      }

      h1 {
        font-size: clamp(2rem, 4vw, 3.3rem);
        line-height: 0.96;
      }

      .hero p {
        margin: 12px 0 0;
        max-width: 72ch;
        color: var(--muted);
        font-size: 1.02rem;
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        padding: 18px;
        margin-bottom: 18px;
      }

      .summary-card {
        padding: 16px 18px;
        background: linear-gradient(180deg, rgba(255, 249, 240, 0.95), rgba(245, 236, 218, 0.95));
        border: 1px solid var(--line);
        border-radius: 18px;
      }

      .summary-card p {
        color: var(--muted);
        min-height: 2.8em;
      }

      .filters {
        position: sticky;
        top: 12px;
        z-index: 5;
        padding: 18px;
        margin-bottom: 18px;
      }

      .filter-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 14px;
        align-items: end;
      }

      .filter-block {
        min-width: 0;
      }

      .filter-block label {
        display: block;
        margin-bottom: 7px;
        color: var(--muted);
        font-size: 0.9rem;
      }

      input[type="search"],
      select {
        width: 100%;
        border: 1px solid rgba(63, 44, 27, 0.22);
        border-radius: 12px;
        padding: 11px 12px;
        background: #fffdfa;
        color: var(--ink);
        font: inherit;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        border: 1px solid rgba(63, 44, 27, 0.2);
        background: #fffdfa;
        color: var(--ink);
        padding: 9px 12px;
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
      }

      .chip.active {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent);
      }

      .actions {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin-top: 16px;
        align-items: center;
        flex-wrap: wrap;
      }

      .status {
        color: var(--muted);
        font-size: 0.95rem;
      }

      .reset {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        background: var(--ink);
        color: #fff9ee;
        cursor: pointer;
        font: inherit;
      }

      .table-wrap {
        overflow: hidden;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #f4ead8;
        text-align: left;
        padding: 14px 12px;
        border-bottom: 1px solid var(--line);
        font-size: 0.92rem;
      }

      tbody td {
        vertical-align: top;
        padding: 14px 12px;
        border-bottom: 1px solid rgba(63, 44, 27, 0.1);
      }

      tbody tr:nth-child(odd) {
        background: rgba(255, 251, 244, 0.72);
      }

      .entry-title {
        font-weight: 700;
        margin-bottom: 4px;
      }

      .entry-meta {
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.35;
      }

      .pair {
        display: grid;
        gap: 8px;
      }

      .pair strong {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 4px;
      }

      .english {
        font-size: 1rem;
      }

      .polish {
        color: #43362b;
      }

      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 1px solid rgba(31, 111, 95, 0.2);
        background: rgba(31, 111, 95, 0.08);
        color: var(--accent);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 0.78rem;
        line-height: 1;
        cursor: pointer;
      }

      .tag.muted {
        cursor: default;
        border-color: rgba(63, 44, 27, 0.14);
        background: rgba(63, 44, 27, 0.06);
        color: var(--muted);
      }

      details {
        border: 1px solid rgba(63, 44, 27, 0.12);
        border-radius: 14px;
        background: rgba(248, 241, 228, 0.55);
        padding: 10px 12px;
      }

      summary {
        cursor: pointer;
        font-weight: 700;
      }

      .detail-list {
        margin: 10px 0 0;
        padding-left: 18px;
      }

      .detail-list li + li {
        margin-top: 8px;
      }

      code {
        font-size: 0.85rem;
        background: rgba(63, 44, 27, 0.08);
        padding: 2px 5px;
        border-radius: 6px;
      }

      .empty {
        padding: 28px 18px;
        text-align: center;
        color: var(--muted);
      }

      @media (max-width: 1100px) {
        .filter-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 820px) {
        .shell {
          width: min(100vw - 16px, 100%);
          padding-top: 16px;
        }

        .hero,
        .filters,
        .summary,
        .table-wrap {
          border-radius: 18px;
        }

        .filter-grid {
          grid-template-columns: 1fr;
        }

        table,
        thead,
        tbody,
        th,
        td,
        tr {
          display: block;
        }

        thead {
          display: none;
        }

        tbody tr {
          padding: 14px 14px 6px;
        }

        tbody td {
          padding: 0 0 12px;
          border: 0;
        }

        tbody td::before {
          content: attr(data-label);
          display: block;
          margin-bottom: 4px;
          color: var(--muted);
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1>Vacab List</h1>
        <p>
          Browser view for the experimental curriculum files. You can inspect vocab, sentence tasks, and stories from the
          editable master set plus the generated tiered, A2, and B1 exports. Click any visible tag to filter faster.
        </p>
      </section>

      <section class="summary">
        ${datasetSummary}
      </section>

      <section class="filters">
        <div class="filter-grid">
          <div class="filter-block">
            <label for="search">Search</label>
            <input id="search" type="search" placeholder="Search by word, Polish text, id, vocab id, or file..." />
          </div>

          <div class="filter-block">
            <label>Datasets</label>
            <div id="datasetChips" class="chip-row"></div>
          </div>

          <div class="filter-block">
            <label>Entry Types</label>
            <div id="kindChips" class="chip-row"></div>
          </div>

          <div class="filter-block">
            <label for="categoryFilter">Category</label>
            <select id="categoryFilter"></select>
          </div>

          <div class="filter-block">
            <label for="tierFilter">Tier / CEFR</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <select id="tierFilter"></select>
              <select id="cefrFilter"></select>
            </div>
          </div>
        </div>

        <div class="actions">
          <div id="status" class="status"></div>
          <button id="resetFilters" class="reset" type="button">Reset Filters</button>
        </div>
      </section>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 21%">Entry</th>
              <th style="width: 21%">Content</th>
              <th style="width: 20%">Polish</th>
              <th style="width: 18%">Tags</th>
              <th style="width: 20%">Details</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
        <div id="emptyState" class="empty" hidden>No entries match the current filters.</div>
      </section>
    </main>

    <script>
      const records = ${safeRecords};
      const datasetOrder = ${JSON.stringify(datasetSpecs.map((item) => item.id))};
      const datasetLabels = ${JSON.stringify(Object.fromEntries(datasetSpecs.map((item) => [item.id, item.label])))};
      const kindOrder = ["vocab", "sentence", "story"];
      const kindLabels = ${JSON.stringify(sectionLabels)};
      const categoryLabels = ${JSON.stringify(categoryLabels)};

      const state = {
        activeDatasets: new Set(datasetOrder),
        activeKinds: new Set(kindOrder),
        category: "all",
        tier: "all",
        cefr: "all",
        search: "",
      };

      const searchInput = document.querySelector("#search");
      const datasetChips = document.querySelector("#datasetChips");
      const kindChips = document.querySelector("#kindChips");
      const categoryFilter = document.querySelector("#categoryFilter");
      const tierFilter = document.querySelector("#tierFilter");
      const cefrFilter = document.querySelector("#cefrFilter");
      const tableBody = document.querySelector("#tableBody");
      const status = document.querySelector("#status");
      const emptyState = document.querySelector("#emptyState");
      const resetFilters = document.querySelector("#resetFilters");

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function slugToLabel(value) {
        if (!value) return "None";
        return String(value)
          .replaceAll(/[_-]+/g, " ")
          .replace(/\\b\\w/g, (char) => char.toUpperCase());
      }

      function getCategoryLabel(value) {
        return categoryLabels[value] ?? slugToLabel(value);
      }

      function renderChips(container, values, labels, activeSet, key) {
        container.innerHTML = values
          .map((value) => {
            const active = activeSet.has(value);
            return \`<button class="chip \${active ? "active" : ""}" type="button" data-chip-key="\${key}" data-chip-value="\${value}">\${escapeHtml(labels[value])}</button>\`;
          })
          .join("");
      }

      function fillSelect(select, options, labels) {
        select.innerHTML = options
          .map((value) => \`<option value="\${value}">\${escapeHtml(labels[value] ?? slugToLabel(value))}</option>\`)
          .join("");
      }

      function formatTag(label, value, key, clickable = true) {
        const className = clickable ? "tag" : "tag muted";
        const attrs = clickable ? \` data-filter-key="\${key}" data-filter-value="\${escapeHtml(value)}"\` : "";
        return \`<button class="\${className}" type="button"\${attrs}>\${escapeHtml(label)}</button>\`;
      }

      function rowDetails(record) {
        if (record.kind === "vocab") {
          return \`
            <details>
              <summary>Distractors</summary>
              <ul class="detail-list">
                \${record.distractors.map((item) => \`<li><code>\${escapeHtml(item)}</code></li>\`).join("")}
              </ul>
            </details>
          \`;
        }

        if (record.kind === "sentence") {
          return \`
            <details>
              <summary>Steps and vocab ids</summary>
              <ul class="detail-list">
                \${record.steps.map((step) => \`<li><strong>\${escapeHtml(step.correct)}</strong> vs <code>\${escapeHtml(step.distractor)}</code></li>\`).join("")}
                \${record.vocabIds.length ? \`<li>Vocab ids: \${record.vocabIds.map((item) => \`<code>\${escapeHtml(item)}</code>\`).join(" ")}</li>\` : ""}
              </ul>
            </details>
          \`;
        }

        return \`
          <details>
            <summary>\${record.storySentences.length} sentence\${record.storySentences.length === 1 ? "" : "s"}</summary>
            <ul class="detail-list">
              \${record.storySentences.map((sentence) => \`<li><strong>\${escapeHtml(sentence.en)}</strong><br />\${escapeHtml(sentence.pl)}</li>\`).join("")}
              \${record.vocabIds.length ? \`<li>Vocab ids: \${record.vocabIds.map((item) => \`<code>\${escapeHtml(item)}</code>\`).join(" ")}</li>\` : ""}
            </ul>
          </details>
        \`;
      }

      function rowContent(record) {
        if (record.kind === "vocab") {
          return \`
            <div class="pair">
              <div><strong>English</strong><div class="english">\${escapeHtml(record.english)}</div></div>
              <div><strong>Polish Pair</strong><div>\${escapeHtml(record.summary)}</div></div>
            </div>
          \`;
        }

        if (record.kind === "sentence") {
          return \`
            <div class="pair">
              <div><strong>English</strong><div class="english">\${escapeHtml(record.english)}</div></div>
              <div><strong>Sentence Id</strong><div><code>\${escapeHtml(record.id)}</code></div></div>
            </div>
          \`;
        }

        return \`
          <div class="pair">
            <div><strong>Title</strong><div class="english">\${escapeHtml(record.title)}</div></div>
            <div><strong>English Story</strong><div>\${escapeHtml(record.english)}</div></div>
          </div>
        \`;
      }

      function rowPolish(record) {
        if (record.kind === "story") {
          return \`
            <div class="pair">
              <div><strong>Story Polish</strong><div class="polish">\${escapeHtml(record.polish)}</div></div>
            </div>
          \`;
        }

        return \`
          <div class="pair">
            <div><strong>Polish</strong><div class="polish">\${escapeHtml(record.polish)}</div></div>
          </div>
        \`;
      }

      function renderTable() {
        const filtered = records.filter((record) => {
          if (!state.activeDatasets.has(record.dataset)) return false;
          if (!state.activeKinds.has(record.kind)) return false;
          if (state.category !== "all" && record.category !== state.category) return false;
          if (state.tier !== "all" && String(record.tier) !== state.tier) return false;
          if (state.cefr !== "all" && record.cefr !== state.cefr) return false;
          if (state.search && !record.searchText.includes(state.search)) return false;
          return true;
        });

        tableBody.innerHTML = filtered
          .map((record) => {
            const tags = [
              formatTag(\`dataset: \${datasetLabels[record.dataset]}\`, record.dataset, "dataset"),
              formatTag(\`type: \${kindLabels[record.kind]}\`, record.kind, "kind"),
              formatTag(\`category: \${getCategoryLabel(record.category)}\`, record.category, "category"),
              formatTag(\`tier: \${record.tier}\`, String(record.tier), "tier"),
              formatTag(\`cefr: \${String(record.cefr).toUpperCase()}\`, record.cefr, "cefr"),
              formatTag(record.file, record.file, "noop", false),
            ].join("");

            return \`
              <tr>
                <td data-label="Entry">
                  <div class="entry-title">\${escapeHtml(record.title)}</div>
                  <div class="entry-meta">
                    <div><code>\${escapeHtml(record.id)}</code></div>
                    <div>\${escapeHtml(datasetLabels[record.dataset])} · \${escapeHtml(kindLabels[record.kind])}</div>
                    <div>\${escapeHtml(record.file)}</div>
                  </div>
                </td>
                <td data-label="Content">\${rowContent(record)}</td>
                <td data-label="Polish">\${rowPolish(record)}</td>
                <td data-label="Tags"><div class="tag-list">\${tags}</div></td>
                <td data-label="Details">\${rowDetails(record)}</td>
              </tr>
            \`;
          })
          .join("");

        emptyState.hidden = filtered.length !== 0;
        tableBody.parentElement.hidden = filtered.length === 0;

        const datasetCounts = datasetOrder
          .map((dataset) => {
            const count = filtered.filter((record) => record.dataset === dataset).length;
            return \`\${datasetLabels[dataset]}: \${count}\`;
          })
          .join(" | ");

        const kindCounts = kindOrder
          .map((kind) => {
            const count = filtered.filter((record) => record.kind === kind).length;
            return \`\${kindLabels[kind]}: \${count}\`;
          })
          .join(" | ");

        status.textContent = \`\${filtered.length} visible entries. \${datasetCounts}. \${kindCounts}.\`;
      }

      function syncControls() {
        renderChips(datasetChips, datasetOrder, datasetLabels, state.activeDatasets, "dataset");
        renderChips(kindChips, kindOrder, kindLabels, state.activeKinds, "kind");
        categoryFilter.value = state.category;
        tierFilter.value = state.tier;
        cefrFilter.value = state.cefr;
        searchInput.value = state.search;
      }

      function resetState() {
        state.activeDatasets = new Set(datasetOrder);
        state.activeKinds = new Set(kindOrder);
        state.category = "all";
        state.tier = "all";
        state.cefr = "all";
        state.search = "";
      }

      const categoryOptions = ["all", ...Array.from(new Set(records.map((record) => record.category))).sort()];
      const tierOptions = ["all", ...Array.from(new Set(records.map((record) => String(record.tier)))).sort((left, right) => Number(left) - Number(right))];
      const cefrOptions = ["all", ...Array.from(new Set(records.map((record) => record.cefr))).sort()];

      fillSelect(categoryFilter, categoryOptions, { all: "All categories", ...categoryLabels });
      fillSelect(tierFilter, tierOptions, { all: "All tiers" });
      fillSelect(cefrFilter, cefrOptions, { all: "All CEFR" });
      resetState();
      syncControls();
      renderTable();

      searchInput.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        renderTable();
      });

      categoryFilter.addEventListener("change", (event) => {
        state.category = event.target.value;
        renderTable();
      });

      tierFilter.addEventListener("change", (event) => {
        state.tier = event.target.value;
        renderTable();
      });

      cefrFilter.addEventListener("change", (event) => {
        state.cefr = event.target.value;
        renderTable();
      });

      resetFilters.addEventListener("click", () => {
        resetState();
        syncControls();
        renderTable();
      });

      document.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-chip-key]");
        if (chip) {
          const key = chip.dataset.chipKey;
          const value = chip.dataset.chipValue;
          const set = key === "dataset" ? state.activeDatasets : state.activeKinds;

          if (set.has(value)) {
            if (set.size > 1) {
              set.delete(value);
            }
          } else {
            set.add(value);
          }

          syncControls();
          renderTable();
          return;
        }

        const tag = event.target.closest("[data-filter-key]");
        if (!tag) {
          return;
        }

        const key = tag.dataset.filterKey;
        const value = tag.dataset.filterValue;

        if (key === "dataset") {
          state.activeDatasets = new Set([value]);
        } else if (key === "kind") {
          state.activeKinds = new Set([value]);
        } else if (key === "category") {
          state.category = value;
        } else if (key === "tier") {
          state.tier = value;
        } else if (key === "cefr") {
          state.cefr = value;
        }

        syncControls();
        renderTable();
      });
    </script>
  </body>
</html>
`;
}

const records = collectRecords();
fs.writeFileSync(outputPath, buildHtml(records), "utf8");
console.log(`Wrote ${path.relative(repoRoot, outputPath)} with ${records.length} entries.`);
