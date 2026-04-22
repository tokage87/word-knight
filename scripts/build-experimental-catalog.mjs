import fs from 'node:fs';
import path from 'node:path';
import {
  CEFR_DIR,
  MASTER_DIR,
  TIERED_DIR,
} from './experimental-catalog-seed.mjs';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function byCurriculum(a, b) {
  return (
    a.tier - b.tier ||
    a.category.localeCompare(b.category) ||
    a.id.localeCompare(b.id)
  );
}

function build() {
  const vocab = readJson(path.join(MASTER_DIR, 'vocab.json')).sort(byCurriculum);
  const sentences = readJson(path.join(MASTER_DIR, 'sentences.json')).sort(byCurriculum);
  const stories = readJson(path.join(MASTER_DIR, 'stories.json')).sort(byCurriculum);

  ensureDir(TIERED_DIR);
  ensureDir(path.join(CEFR_DIR, 'a2'));
  ensureDir(path.join(CEFR_DIR, 'b1'));

  writeJson(path.join(TIERED_DIR, 'vocab.json'), vocab);
  writeJson(path.join(TIERED_DIR, 'sentences.json'), sentences);
  writeJson(path.join(TIERED_DIR, 'stories.json'), stories);

  const a2 = {
    vocab: vocab.filter((entry) => entry.cefr === 'a2'),
    sentences: sentences.filter((entry) => entry.cefr === 'a2'),
    stories: stories.filter((entry) => entry.cefr === 'a2'),
  };
  const b1 = {
    vocab: vocab.filter((entry) => entry.cefr === 'b1'),
    sentences: sentences.filter((entry) => entry.cefr === 'b1'),
    stories: stories.filter((entry) => entry.cefr === 'b1'),
  };

  writeJson(path.join(CEFR_DIR, 'a2', 'vocab.json'), a2.vocab);
  writeJson(path.join(CEFR_DIR, 'a2', 'sentences.json'), a2.sentences);
  writeJson(path.join(CEFR_DIR, 'a2', 'stories.json'), a2.stories);
  writeJson(path.join(CEFR_DIR, 'b1', 'vocab.json'), b1.vocab);
  writeJson(path.join(CEFR_DIR, 'b1', 'sentences.json'), b1.sentences);
  writeJson(path.join(CEFR_DIR, 'b1', 'stories.json'), b1.stories);

  const summary = {
    master: {
      vocab: vocab.length,
      sentences: sentences.length,
      stories: stories.length,
    },
    a2: {
      vocab: a2.vocab.length,
      sentences: a2.sentences.length,
      stories: a2.stories.length,
    },
    b1: {
      vocab: b1.vocab.length,
      sentences: b1.sentences.length,
      stories: b1.stories.length,
    },
  };

  writeJson(path.join(TIERED_DIR, 'summary.json'), summary);
}

build();

