import { describe, it, expect } from 'vitest';
// Safe to import directly: the SpeechRecognition / speechSynthesis code
// paths are feature-guarded and not invoked by the pure helpers.
import { tokenizeEn, tokenOverlap, sourceLangCode } from '../speech';

describe('tokenizeEn', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenizeEn('The Cat SLEEPS')).toEqual(['the', 'cat', 'sleeps']);
  });

  it('strips punctuation and digits', () => {
    expect(tokenizeEn('Hello, world! (42 times)')).toEqual(['hello', 'world', 'times']);
  });

  it('keeps German umlauts and ß', () => {
    expect(tokenizeEn('Müller heißt Größe für Straße')).toEqual(['müller', 'heißt', 'größe', 'für', 'straße']);
  });

  it('keeps apostrophes and hyphens inside words', () => {
    expect(tokenizeEn("Don't be well-known")).toEqual(["don't", 'be', 'well-known']);
  });

  it('returns [] for empty or punctuation-only input', () => {
    expect(tokenizeEn('')).toEqual([]);
    expect(tokenizeEn('   ')).toEqual([]);
    expect(tokenizeEn('?!., 123')).toEqual([]);
  });
});

describe('tokenOverlap', () => {
  it('returns 1 for an empty target', () => {
    expect(tokenOverlap('', 'anything at all')).toBe(1);
    expect(tokenOverlap('?!.', '')).toBe(1);
  });

  it('returns 1 on full overlap regardless of order and case', () => {
    expect(tokenOverlap('The cat sleeps', 'sleeps THE cat')).toBe(1);
  });

  it('returns the fraction of target tokens found', () => {
    expect(tokenOverlap('the cat sleeps', 'the dog sleeps')).toBeCloseTo(2 / 3);
    expect(tokenOverlap('one two three four', 'four')).toBeCloseTo(1 / 4);
  });

  it('returns 0 when nothing matches', () => {
    expect(tokenOverlap('alpha beta', 'gamma delta')).toBe(0);
  });

  it('ignores duplicates in the spoken transcript', () => {
    expect(tokenOverlap('the cat', 'the the the the')).toBeCloseTo(1 / 2);
  });

  it('counts duplicated target tokens individually', () => {
    // target has "the" twice; one spoken "the" satisfies both occurrences
    expect(tokenOverlap('the the cat', 'the')).toBeCloseTo(2 / 3);
  });
});

describe('sourceLangCode', () => {
  it('maps the German exam source to de-DE and everything else to en-US', () => {
    expect(sourceLangCode('experimental-de-exam')).toBe('de-DE');
    expect(sourceLangCode('legacy')).toBe('en-US');
    expect(sourceLangCode('experimental-tiered')).toBe('en-US');
  });
});
