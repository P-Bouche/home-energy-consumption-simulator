import { describe, expect, it } from 'vitest';
import {
  confidenceFromJson,
  confidenceToJson,
  createConfidence,
  inferred,
  isMeasured,
  measured
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

describe('Confidence<T> value object', () => {
  it('builds a measured value with confidence 1', () => {
    const c = measured(80.84, 'dpe-xml:dpe/logement/caracteristique_generale/surface_habitable_logement', date);
    expect(c.value).toBe(80.84);
    expect(c.confidence).toBe(1);
    expect(isMeasured(c)).toBe(true);
    expect(c.importDate).toEqual(date);
  });

  it('builds an inferred value with confidence < 1', () => {
    const c = inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date);
    expect(isMeasured(c)).toBe(false);
    expect(c.source).toBe('inference:default-ceiling-height-2.5m');
  });

  it('type-level rule enforced at runtime: inferred() rejects confidence >= 1', () => {
    expect(() => inferred(2.5, 'inference:x', 1, date)).toThrow(RangeError);
    expect(() => inferred(2.5, 'inference:x', 1.5, date)).toThrow(RangeError);
  });

  it('rejects an empty source', () => {
    expect(() => createConfidence(1, '', 0.5, date)).toThrow(TypeError);
    expect(() => createConfidence(1, '   ', 0.5, date)).toThrow(TypeError);
  });

  it('rejects confidence outside [0, 1] or non-finite', () => {
    expect(() => createConfidence(1, 's', -0.1, date)).toThrow(RangeError);
    expect(() => createConfidence(1, 's', 1.1, date)).toThrow(RangeError);
    expect(() => createConfidence(1, 's', Number.NaN, date)).toThrow(RangeError);
  });

  it('rejects an invalid importDate', () => {
    expect(() => createConfidence(1, 's', 0.5, new Date('not a date'))).toThrow(TypeError);
  });

  it('serializes to JSON and revives with identical data', () => {
    const c = inferred(0.34, 'inference:test', 0.66, date);
    const json = confidenceToJson(c);
    expect(json.importDate).toBe('2026-11-20T10:00:00.000Z');
    const revived = confidenceFromJson(json);
    expect(revived.value).toBe(c.value);
    expect(revived.source).toBe(c.source);
    expect(revived.confidence).toBe(c.confidence);
    expect(revived.importDate).toEqual(date);
  });

  it('is immutable', () => {
    const c = measured(1, 'dpe-xml:x', date);
    expect(Object.isFrozen(c)).toBe(true);
  });
});
