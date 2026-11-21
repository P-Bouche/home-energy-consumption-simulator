import { describe, expect, it } from 'vitest';
import { translateFieldError } from '../src/services/error-messages.ts';

describe('translateFieldError (render-layer French validation)', () => {
  it('translates the U range message (audit/e2e case: must be in (0, 4] W/m².K)', () => {
    const t = translateFieldError('uValueWm2K', 'must be in (0, 4] W/m².K');
    expect(t.french).toBe('U doit être compris entre 0 et 4 W/m².K');
    expect(t.raw).toBe('must be in (0, 4] W/m².K');
  });

  it('uses the Uw subject for a window U field', () => {
    const t = translateFieldError('uValueWm2K', 'must be in (0, 4] W/m².K', 'Uw');
    expect(t.french).toBe('Uw doit être compris entre 0 et 4 W/m².K');
  });

  it('translates the closed-range and unit-less templates', () => {
    expect(translateFieldError('solarFactorSw', 'must be in [0, 1]').french).toBe(
      'Le facteur solaire Sw : valeur attendue entre 0 et 1'
    );
    expect(translateFieldError('q4paConv', 'must be in [0, 3] m³/(h.m²)').french).toBe(
      'q4pa conv : valeur attendue entre 0 et 3 m³/(h.m²)'
    );
    expect(translateFieldError('areaM2', 'must be in (0, 10000] m²').french).toBe(
      'La surface : valeur attendue entre 0 et 10000 m²'
    );
  });

  it('translates the fixed templates', () => {
    expect(translateFieldError('uValueWm2K', 'must be a finite number').french).toBe('U doit être un nombre valide');
    expect(translateFieldError('count', 'must be a positive integer').french).toBe(
      'Le nombre doit être un nombre entier positif'
    );
    expect(translateFieldError('description', 'description cannot be null').french).toBe(
      'La description ne doit pas être vide'
    );
    expect(translateFieldError('orientation', 'must be a non-empty string').french).toBe(
      "L'orientation ne doit pas être vide"
    );
  });

  it('falls back to the raw message for unknown templates (never invents a translation)', () => {
    const raw = 'some future engine message';
    const t = translateFieldError('orientation', raw);
    expect(t.french).toBe(raw);
    expect(t.raw).toBe(raw);
  });
});
