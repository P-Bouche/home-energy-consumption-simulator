import { describe, expect, it } from 'vitest';
import { HEATING_PRESETS, U_PRESETS, VENTILATION_PRESETS, WINDOW_PRESETS } from '../src/services/presets.ts';

describe('level-M preset cards (issue #32)', () => {
  it('U presets stay within the opaque domain bound (0, 4] and cover the bands', () => {
    expect(U_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of U_PRESETS) {
      expect(p.u).toBeGreaterThan(0);
      expect(p.u).toBeLessThanOrEqual(4);
    }
  });

  it('window presets stay within the window bound (0, 6] (issue #48 rework)', () => {
    for (const p of WINDOW_PRESETS) {
      expect(p.uw).toBeGreaterThan(0);
      expect(p.uw).toBeLessThanOrEqual(6);
    }
    // simple vitrage must be allowed above the old opaque ceiling of 4
    expect(WINDOW_PRESETS.some((p) => p.uw > 4)).toBe(true);
  });

  it('window presets carry the coherent group Uw + glazingType enum + Sw (engine tv.sw defaults)', () => {
    for (const p of WINDOW_PRESETS) {
      expect(/^[1-6]$/.test(p.glazingType)).toBe(true); // type_vitrage ids
      expect(p.sw).toBeGreaterThan(0);
      expect(p.sw).toBeLessThanOrEqual(1);
    }
    // engine tv.sw defaults: simple 0.58, double 0.52, double VIR 0.45, triple 0.46
    expect(WINDOW_PRESETS.map((p) => [p.label, p.glazingType, p.sw])).toEqual([
      ['Simple vitrage', '1', 0.58],
      ['Double vitrage', '2', 0.52],
      ['Double vitrage récent', '2', 0.45],
      ['Triple vitrage', '3', 0.46]
    ]);
  });

  it('heating presets map to DPE generator enum ids (ADR-0004 v2 command)', () => {
    for (const p of HEATING_PRESETS) {
      expect(/^\d+$/.test(p.generatorType)).toBe(true);
    }
  });

  it('ventilation presets map to DPE ventilation enum ids', () => {
    for (const p of VENTILATION_PRESETS) {
      expect(/^\d+$/.test(p.ventilationType)).toBe(true);
    }
  });
});
