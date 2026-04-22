import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_IDS,
  CEFR_BY_TIER,
  CEFR_DIR,
  MASTER_DIR,
  TIERED_DIR,
} from './experimental-catalog-seed.mjs';

const TIERS = [1, 2, 3];
const CEFR_VALUES = new Set(Object.values(CEFR_BY_TIER));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function validateStepList(steps) {
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every(
      (step) =>
        step &&
        typeof step.correct === 'string' &&
        step.correct.trim() &&
        typeof step.distractor === 'string' &&
        step.distractor.trim(),
    )
  );
}

function countBy(entries, keyFn) {
  const map = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function validateCurriculumSet(name, vocab, sentences, stories, options = {}) {
  const errors = [];
  const warnings = [];
  const vocabById = new Map();
  const seenIds = new Set();
  const pairMap = new Map();
  const enMap = new Map();
  const plMap = new Map();

  for (const entry of vocab) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.pl !== 'string' ||
      typeof entry.en !== 'string' ||
      !Array.isArray(entry.distractors) ||
      !CATEGORY_IDS.includes(entry.category) ||
      !TIERS.includes(entry.tier) ||
      !CEFR_VALUES.has(entry.cefr)
    ) {
      errors.push(`[${name}] Invalid vocab schema for ${entry?.id ?? '<unknown>'}`);
      continue;
    }
    if (CEFR_BY_TIER[entry.tier] !== entry.cefr) {
      errors.push(`[${name}] Tier/CEFR mismatch for vocab ${entry.id}`);
    }
    if (seenIds.has(entry.id)) {
      errors.push(`[${name}] Duplicate vocab id ${entry.id}`);
    }
    seenIds.add(entry.id);
    vocabById.set(entry.id, entry);

    const pairKey = `${normalized(entry.en)}::${normalized(entry.pl)}`;
    const enKey = normalized(entry.en);
    const plKey = normalized(entry.pl);
    push(pairMap, pairKey, entry.id);
    push(enMap, enKey, entry.id);
    push(plMap, plKey, entry.id);

    if (entry.distractors.length < 3 || entry.distractors.some((value) => !String(value).trim())) {
      errors.push(`[${name}] Bad distractors on vocab ${entry.id}`);
    }
  }

  for (const [pairKey, ids] of pairMap.entries()) {
    if (ids.length > 1) errors.push(`[${name}] Duplicate en/pl pair ${pairKey} -> ${ids.join(', ')}`);
  }
  for (const [enKey, ids] of enMap.entries()) {
    if (ids.length > 1) warnings.push(`[${name}] Duplicate English headword ${enKey} -> ${ids.join(', ')}`);
  }
  for (const [plKey, ids] of plMap.entries()) {
    if (ids.length > 1) warnings.push(`[${name}] Duplicate Polish headword ${plKey} -> ${ids.join(', ')}`);
  }

  function validateTask(entry, kind) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.pl !== 'string' ||
      !Array.isArray(entry.vocabIds) ||
      !CATEGORY_IDS.includes(entry.category) ||
      !TIERS.includes(entry.tier) ||
      !CEFR_VALUES.has(entry.cefr) ||
      !validateStepList(entry.steps)
    ) {
      errors.push(`[${name}] Invalid ${kind} schema for ${entry?.id ?? '<unknown>'}`);
      return;
    }
    if (CEFR_BY_TIER[entry.tier] !== entry.cefr) {
      errors.push(`[${name}] Tier/CEFR mismatch for ${kind} ${entry.id}`);
    }
    if (entry.vocabIds.length === 0) {
      errors.push(`[${name}] Missing vocabIds on ${kind} ${entry.id}`);
    }
    const referenced = entry.vocabIds.map((id) => vocabById.get(id));
    if (referenced.some((value) => !value)) {
      errors.push(`[${name}] Broken vocabIds on ${kind} ${entry.id}`);
      return;
    }
    const maxTier = Math.max(...referenced.map((value) => value.tier));
    if (maxTier !== entry.tier) {
      errors.push(`[${name}] ${kind} ${entry.id} has tier ${entry.tier} but referenced max tier ${maxTier}`);
    }
    if (referenced.some((value) => value.category !== entry.category)) {
      errors.push(`[${name}] Category mismatch on ${kind} ${entry.id}`);
    }
    if (options.cefrOnly && entry.cefr !== options.cefrOnly) {
      errors.push(`[${name}] ${kind} ${entry.id} should be ${options.cefrOnly}`);
    }
    if (options.cefrOnly === 'a2' && referenced.some((value) => value.cefr === 'b1')) {
      errors.push(`[${name}] A2 ${kind} ${entry.id} references B1 vocab`);
    }
    if (options.cefrOnly === 'b1' && referenced.some((value) => value.cefr !== 'b1')) {
      warnings.push(`[${name}] B1 ${kind} ${entry.id} references lower-level support vocab ids`);
    }
  }

  const sentenceIds = new Set();
  for (const entry of sentences) {
    if (sentenceIds.has(entry.id)) errors.push(`[${name}] Duplicate sentence id ${entry.id}`);
    sentenceIds.add(entry.id);
    validateTask(entry, 'sentence');
  }

  const storyIds = new Set();
  for (const story of stories) {
    if (
      !story ||
      typeof story.id !== 'string' ||
      typeof story.title !== 'string' ||
      !Array.isArray(story.vocabIds) ||
      !Array.isArray(story.sentences) ||
      !CATEGORY_IDS.includes(story.category) ||
      !TIERS.includes(story.tier) ||
      !CEFR_VALUES.has(story.cefr)
    ) {
      errors.push(`[${name}] Invalid story schema for ${story?.id ?? '<unknown>'}`);
      continue;
    }
    if (storyIds.has(story.id)) errors.push(`[${name}] Duplicate story id ${story.id}`);
    storyIds.add(story.id);
    if (CEFR_BY_TIER[story.tier] !== story.cefr) {
      errors.push(`[${name}] Tier/CEFR mismatch for story ${story.id}`);
    }
    const expectedLength = story.tier + 1;
    if (story.sentences.length !== expectedLength) {
      errors.push(
        `[${name}] Story ${story.id} should have ${expectedLength} sentences, found ${story.sentences.length}`,
      );
    }
    if (story.vocabIds.length === 0) {
      errors.push(`[${name}] Missing vocabIds on story ${story.id}`);
    }
    const referenced = story.vocabIds.map((id) => vocabById.get(id));
    if (referenced.some((value) => !value)) {
      errors.push(`[${name}] Broken vocabIds on story ${story.id}`);
    } else {
      const maxTier = Math.max(...referenced.map((value) => value.tier));
      if (maxTier !== story.tier) {
        errors.push(`[${name}] Story ${story.id} has tier ${story.tier} but referenced max tier ${maxTier}`);
      }
      if (referenced.some((value) => value.category !== story.category)) {
        errors.push(`[${name}] Category mismatch on story ${story.id}`);
      }
      if (options.cefrOnly && story.cefr !== options.cefrOnly) {
        errors.push(`[${name}] Story ${story.id} should be ${options.cefrOnly}`);
      }
      if (options.cefrOnly === 'a2' && referenced.some((value) => value.cefr === 'b1')) {
        errors.push(`[${name}] A2 story ${story.id} references B1 vocab`);
      }
    }

    story.sentences.forEach((sentence, index) => {
      if (
        !sentence ||
        typeof sentence.id !== 'string' ||
        typeof sentence.pl !== 'string' ||
        !validateStepList(sentence.steps)
      ) {
        errors.push(`[${name}] Invalid inner story sentence ${story.id}#${index + 1}`);
      }
    });
  }

  if (!options.cefrOnly) {
    const vocabTierCounts = countBy(vocab, (entry) => entry.tier);
    const storyTierCounts = countBy(stories, (entry) => entry.tier);
    for (const tier of TIERS) {
      if ((vocabTierCounts.get(tier) ?? 0) < 200) {
        errors.push(`[${name}] Tier ${tier} has fewer than 200 vocab items`);
      }
      if ((storyTierCounts.get(tier) ?? 0) < 50 || (storyTierCounts.get(tier) ?? 0) > 100) {
        errors.push(`[${name}] Tier ${tier} should have 50-100 stories`);
      }
      for (const category of CATEGORY_IDS) {
        const vocabCount = vocab.filter((entry) => entry.tier === tier && entry.category === category).length;
        const sentenceCount =
          sentences.filter((entry) => entry.tier === tier && entry.category === category).length;
        const storyCount = stories.filter((entry) => entry.tier === tier && entry.category === category).length;
        if (vocabCount < 35) errors.push(`[${name}] ${category} tier ${tier} has only ${vocabCount} vocab items`);
        if (sentenceCount < 12) errors.push(`[${name}] ${category} tier ${tier} has only ${sentenceCount} sentences`);
        if (storyCount < 10) errors.push(`[${name}] ${category} tier ${tier} has only ${storyCount} stories`);
      }
    }
  }

  return {
    errors,
    warnings,
    summary: {
      vocab: vocab.length,
      sentences: sentences.length,
      stories: stories.length,
    },
  };
}

function loadSet(baseDir) {
  return {
    vocab: readJson(path.join(baseDir, 'vocab.json')),
    sentences: readJson(path.join(baseDir, 'sentences.json')),
    stories: readJson(path.join(baseDir, 'stories.json')),
  };
}

function printReport(name, report) {
  console.log(`\n[${name}]`);
  console.log(`vocab=${report.summary.vocab} sentences=${report.summary.sentences} stories=${report.summary.stories}`);
  if (report.warnings.length) {
    console.log(`warnings=${report.warnings.length}`);
    report.warnings.slice(0, 20).forEach((warning) => console.log(`WARN ${warning}`));
  }
  if (report.errors.length) {
    console.log(`errors=${report.errors.length}`);
    report.errors.slice(0, 40).forEach((error) => console.log(`ERR ${error}`));
  } else {
    console.log('errors=0');
  }
}

const master = loadSet(MASTER_DIR);
const tiered = loadSet(TIERED_DIR);
const a2 = loadSet(path.join(CEFR_DIR, 'a2'));
const b1 = loadSet(path.join(CEFR_DIR, 'b1'));

const reports = [
  ['master', validateCurriculumSet('master', master.vocab, master.sentences, master.stories)],
  ['tiered', validateCurriculumSet('tiered', tiered.vocab, tiered.sentences, tiered.stories)],
  ['a2', validateCurriculumSet('a2', a2.vocab, a2.sentences, a2.stories, { cefrOnly: 'a2' })],
  ['b1', validateCurriculumSet('b1', b1.vocab, b1.sentences, b1.stories, { cefrOnly: 'b1' })],
];

let totalErrors = 0;
for (const [name, report] of reports) {
  printReport(name, report);
  totalErrors += report.errors.length;
}

if (totalErrors > 0) {
  process.exitCode = 1;
}

