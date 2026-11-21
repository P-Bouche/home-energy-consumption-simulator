import { describe, expect, it } from 'vitest';
import { describeU, uBand } from '../src/services/u-reading.ts';

/**
 * U-reading thresholds (also stated in the PR body):
 * U > 1.5 -> non isolé · 0.8 < U <= 1.5 -> peu isolé · 0.4 < U <= 0.8 ->
 * isolation moyenne · 0.2 < U <= 0.4 -> bonne isolation · U <= 0.2 ->
 * très bonne isolation.
 */
describe('describeU (plain-language U reading)', () => {
  it('maps the bands, including the boundaries', () => {
    expect(uBand(1.6393)).toBe('non-isole');
    expect(uBand(1.5)).toBe('peu-isole');
    expect(uBand(0.8)).toBe('moyen');
    expect(uBand(0.4)).toBe('bon');
    expect(uBand(0.2)).toBe('tres-bon');
    expect(uBand(0.05)).toBe('tres-bon');
    expect(uBand(4)).toBe('non-isole');
  });

  it('produces the plain-language phrases (audit examples: "mur non isolé", "isolation moyenne", "très bonne isolation")', () => {
    expect(describeU(1.6393, 'mur', 'm')).toBe('mur non isolé');
    expect(describeU(1.0, 'mur', 'm')).toBe('mur peu isolé');
    expect(describeU(0.6, 'mur', 'm')).toBe('isolation moyenne');
    expect(describeU(0.3, 'mur', 'm')).toBe('bonne isolation');
    expect(describeU(0.2, 'mur', 'm')).toBe('très bonne isolation');
  });

  it('agrees on feminine nouns (toiture, baie vitrée)', () => {
    expect(describeU(2, 'toiture', 'f')).toBe('toiture non isolée');
    expect(describeU(1.2, 'baie vitrée', 'f')).toBe('baie vitrée peu isolée');
  });

  it('returns an empty reading for non-finite or non-positive values (nothing claimed)', () => {
    expect(describeU(Number.NaN)).toBe('');
    expect(describeU(Number.POSITIVE_INFINITY)).toBe('');
    expect(describeU(-1, 'mur', 'm')).toBe('');
    expect(describeU(0, 'mur', 'm')).toBe('');
    expect(uBand(Number.NaN)).toBeNull();
  });
});
