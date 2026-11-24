import { describe, expect, it } from 'vitest';
import { describeQ4pa, describeSw, describeU, uBand } from '../src/services/u-reading.ts';

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

describe('window (Uw) bands — issue #48: windows use their own thresholds, not the wall ones', () => {
  it('maps Uw values on the glazing scale (simple ~5, double ancien ~2.8, double récent ~1.1, triple <= 0.8)', () => {
    expect(uBand(5, 'window')).toBe('non-isole');
    expect(uBand(2.8, 'window')).toBe('peu-isole');
    expect(uBand(2, 'window')).toBe('peu-isole'); // NOT "non isolée": standard double glazing is not "non isolé"
    expect(uBand(1.6, 'window')).toBe('moyen');
    expect(uBand(1.1, 'window')).toBe('bon');
    expect(uBand(0.8, 'window')).toBe('tres-bon');
    expect(uBand(0.5, 'window')).toBe('tres-bon');
  });

  it('keeps the wall scale as the default kind (backward compatible)', () => {
    expect(uBand(2)).toBe('non-isole');
    expect(uBand(2, 'wall')).toBe('non-isole');
    expect(uBand(1, 'wall')).toBe('peu-isole');
  });

  it('produces feminine readings for windows on the Uw scale', () => {
    expect(describeU(2.8, 'baie vitrée', 'f', 'window')).toBe('baie vitrée peu isolée');
    expect(describeU(1.1, 'baie vitrée', 'f', 'window')).toBe('bonne isolation');
    expect(describeU(5, 'baie vitrée', 'f', 'window')).toBe('baie vitrée non isolée');
    expect(describeU(0, 'baie vitrée', 'f', 'window')).toBe(''); // invalid Uw: no reading, never "non isolée"
  });
});

describe('describeSw (solar factor, issue #48 finding 4)', () => {
  it('maps Sw to plain-language solar-gain readings', () => {
    expect(describeSw(0.6)).toBe('forts apports solaires');
    expect(describeSw(0.5)).toBe('forts apports solaires');
    expect(describeSw(0.3)).toBe('apports solaires modérés');
    expect(describeSw(0.1)).toBe('faibles apports solaires');
  });

  it('returns empty for non-finite or non-positive values', () => {
    expect(describeSw(Number.NaN)).toBe('');
    expect(describeSw(0)).toBe('');
    expect(describeSw(-0.2)).toBe('');
  });
});

describe('describeQ4pa (air permeability, issue #48 finding 5)', () => {
  it('maps q4pa to plain-language airtightness readings', () => {
    expect(describeQ4pa(0.4)).toBe('excellente étanchéité à l’air');
    expect(describeQ4pa(0.6)).toBe('excellente étanchéité à l’air');
    expect(describeQ4pa(0.9)).toBe('bonne étanchéité à l’air');
    expect(describeQ4pa(1.2)).toBe('étanchéité à l’air moyenne');
    expect(describeQ4pa(2.5)).toBe('étanchéité à l’air faible');
  });

  it('returns empty for non-finite or non-positive values', () => {
    expect(describeQ4pa(Number.NaN)).toBe('');
    expect(describeQ4pa(0)).toBe('');
  });
});
