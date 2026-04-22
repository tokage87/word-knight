import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_CONTEXTS,
  CATEGORY_IDS,
  CEFR_BY_TIER,
  EXPERIMENTAL_DIR,
  MASTER_DIR,
  ROOT,
  SNAPSHOT_DIR,
  VOCAB_BANKS,
  slugify,
} from './experimental-catalog-seed.mjs';

const SOURCE_FILES = ['vocab.json', 'sentences.json', 'stories.json'];
const TIERS = [1, 2, 3];
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'in',
  'on',
  'at',
  'by',
  'near',
  'and',
  'of',
]);

const STATIC_DISTRACTORS = {
  the: 'a',
  a: 'the',
  an: 'the',
  is: 'are',
  are: 'is',
  this: 'that',
  that: 'this',
  word: 'clue',
  clue: 'word',
  next: 'last',
  first: 'second',
  third: 'second',
  final: 'first',
  now: 'then',
  of: 'for',
  and: 'or',
};

const NO_DISTRACTOR_TOKENS = new Set([
  'this',
  'that',
  'word',
  'clue',
  'now',
  'then',
  'next',
  'first',
  'second',
  'third',
  'final',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tokenizeWords(value) {
  return value
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenPoolForBucket(category, bucket) {
  const frameTokens = CATEGORY_CONTEXTS[category].frames.flatMap((frame) =>
    tokenizeWords(frame.en),
  );
  const wordTokens = bucket.flatMap((entry) => tokenizeWords(entry.en));
  return [
    ...new Set(
      [
        ...frameTokens,
        ...wordTokens,
        'this',
        'that',
        'word',
        'clue',
        'now',
        'then',
        'next',
        'first',
        'second',
        'third',
        'final',
      ].map((token) =>
        token.toLowerCase(),
      ),
    ),
  ];
}

function preserveCase(source, replacement) {
  if (!replacement) return source;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return capitalize(replacement);
  return replacement;
}

function chooseContentDistractor(token, tokenPool, seed) {
  const candidates = tokenPool.filter(
    (candidate) =>
      candidate !== token.toLowerCase() &&
      !STOPWORDS.has(candidate) &&
      !NO_DISTRACTOR_TOKENS.has(candidate) &&
      candidate.length > 1,
  );
  if (candidates.length === 0) return token;
  return candidates[seed % candidates.length];
}

function buildSteps(text, tokenPool, seedBase) {
  return tokenizeWords(text).map((correct, index) => {
    const lower = correct.toLowerCase();
    const mapped = STATIC_DISTRACTORS[lower];
    const distractor = mapped ?? chooseContentDistractor(correct, tokenPool, seedBase + index);
    return {
      correct,
      distractor: preserveCase(correct, distractor),
    };
  });
}

function makeVocabEntry(category, tier, entry, bucket, index) {
  const cefr = CEFR_BY_TIER[tier];
  const id = `${category}-${cefr}-${slugify(entry.en)}`;
  const others = bucket.filter((candidate) => candidate.en !== entry.en);
  const distractors = [1, 2, 3].map((offset) => others[(index + offset) % others.length].en);
  return {
    id,
    pl: entry.pl,
    en: entry.en,
    distractors,
    tier,
    cefr,
    category,
  };
}

function pickUsableWords(category, bucket, needed) {
  const forbidden = new Set(
    CATEGORY_CONTEXTS[category].frames.map((frame) => slugify(frame.key)),
  );
  const preferred = bucket.filter((entry) => !forbidden.has(slugify(entry.en)));
  const ordered = preferred.length >= needed ? preferred : [...preferred, ...bucket];
  return ordered.slice(0, needed);
}

function makeSentenceTask(category, tier, entry, tokenPool, index) {
  const cefr = CEFR_BY_TIER[tier];
  const pattern = index % 4;
  const variants = [
    {
      en: `The word is ${entry.en}.`,
      pl: `To słowo to ${entry.pl}.`,
    },
    {
      en: `This word is ${entry.en}.`,
      pl: `Ten wyraz to ${entry.pl}.`,
    },
    {
      en: `Now the word is ${entry.en}.`,
      pl: `Teraz to słowo to ${entry.pl}.`,
    },
    {
      en: `The next word is ${entry.en}.`,
      pl: `Następne słowo to ${entry.pl}.`,
    },
  ];
  const textEn = variants[pattern].en;
  const textPl = variants[pattern].pl;
  return {
    id: `${category}-${cefr}-sentence-${String(index + 1).padStart(2, '0')}`,
    pl: textPl,
    steps: buildSteps(textEn, tokenPool, index * 7),
    tier,
    cefr,
    category,
    vocabIds: [`${category}-${cefr}-${slugify(entry.en)}`],
  };
}

function makeStory(category, tier, entries, storyIndex, tokenPool) {
  const cefr = CEFR_BY_TIER[tier];
  const storyId = `${category}-${cefr}-story-${String(storyIndex + 1).padStart(2, '0')}`;
  const titleCore =
    entries.length >= 2
      ? `${titleCase(entries[0].en)} and ${titleCase(entries[1].en)}`
      : titleCase(entries[0].en);
  const title = `The ${titleCore}`;
  return {
    id: storyId,
    title,
    tier,
    cefr,
    category,
    vocabIds: entries.map((entry) => `${category}-${cefr}-${slugify(entry.en)}`),
    sentences: entries.map((entry, sentenceIndex) => {
      const variants = [
        {
          en: `The first clue is ${entry.en}.`,
          pl: `Pierwsza wskazówka to ${entry.pl}.`,
        },
        {
          en: `The next clue is ${entry.en}.`,
          pl: `Kolejna wskazówka to ${entry.pl}.`,
        },
        {
          en: `The third clue is ${entry.en}.`,
          pl: `Trzecia wskazówka to ${entry.pl}.`,
        },
        {
          en: `The final clue is ${entry.en}.`,
          pl: `Ostatnia wskazówka to ${entry.pl}.`,
        },
      ];
      const variant = variants[Math.min(sentenceIndex, variants.length - 1)];
      const textEn = variant.en;
      const textPl = variant.pl;
      return {
        id: `${storyId}-s${sentenceIndex + 1}`,
        pl: textPl,
        steps: buildSteps(textEn, tokenPool, storyIndex * 11 + sentenceIndex * 3),
      };
    }),
  };
}

function bootstrap() {
  ensureDir(EXPERIMENTAL_DIR);
  ensureDir(SNAPSHOT_DIR);
  ensureDir(MASTER_DIR);

  for (const fileName of SOURCE_FILES) {
    const sourcePath = path.join(ROOT, 'src/data', fileName);
    const targetPath = path.join(SNAPSHOT_DIR, fileName);
    fs.copyFileSync(sourcePath, targetPath);
  }

  const vocab = [];
  const sentences = [];
  const stories = [];

  for (const category of CATEGORY_IDS) {
    const frames = CATEGORY_CONTEXTS[category].frames;
    for (const tier of TIERS) {
      const bucket = VOCAB_BANKS[category][tier];
      const tokenPool = tokenPoolForBucket(category, bucket);
      const sentenceWords = pickUsableWords(category, bucket, 12);
      const storyPool = pickUsableWords(category, [...bucket.slice(8), ...bucket.slice(0, 8)], 30);
      const storyLength = tier + 1;

      bucket.forEach((entry, index) => {
        vocab.push(makeVocabEntry(category, tier, entry, bucket, index));
      });

      sentenceWords.forEach((entry, index) => {
        sentences.push(
          makeSentenceTask(category, tier, entry, tokenPool, index),
        );
      });

      for (let storyIndex = 0; storyIndex < 10; storyIndex += 1) {
        const storyEntries = [];
        for (let offset = 0; offset < storyLength; offset += 1) {
          const entry = storyPool[(storyIndex * storyLength + offset) % storyPool.length];
          storyEntries.push(entry);
        }
        stories.push(
          makeStory(category, tier, storyEntries, storyIndex, tokenPool),
        );
      }
    }
  }

  writeJson(path.join(MASTER_DIR, 'vocab.json'), vocab);
  writeJson(path.join(MASTER_DIR, 'sentences.json'), sentences);
  writeJson(path.join(MASTER_DIR, 'stories.json'), stories);
}

bootstrap();
