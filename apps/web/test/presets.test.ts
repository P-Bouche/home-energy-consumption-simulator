import { describe, expect, it } from 'vitest';
import {
  HEATING_PRESETS,
  presetsForCatalogField,
  U_PRESETS,
  VENTILATION_PRESETS,
  WINDOW_PRESETS
} from '../src/services/presets.ts';

describe('presetsForCatalogField (issue #77 — scenario work form reuses the editor presets)', () => {
  it('maps the window Uw field to the glazing presets, applying the whole coherent group', () => {
    const presets = presetsForCatalogField('uValueWm2K', 'windows');
    expect(presets.map((p) => p.label)).toEqual(WINDOW_PRESETS.map((p) => p.label));
    const double = presets.find((p) => p.label === 'Double vitrage');
    expect(double?.value).toBe('2.4');
    // one v1 command carries Uw + glazingType + Sw together
    expect(double?.apply).toEqual({ uValueWm2K: '2.4', glazingType: '2', solarFactorSw: '0.52' });
  });

  it('maps the wall/roof/floor U field to the insulation presets', () => {
    for (const kind of ['walls', 'roofs', 'floors']) {
      expect(presetsForCatalogField('uValueWm2K', kind).map((p) => p.value)).toEqual(U_PRESETS.map((p) => String(p.u)));
    }
  });

  it('maps the heating generator and ventilation enum fields', () => {
    expect(presetsForCatalogField('generatorType', 'heatingSystems').map((p) => p.value)).toEqual(
      HEATING_PRESETS.map((p) => p.generatorType)
    );
    expect(presetsForCatalogField('ventilationType', 'ventilationSystems').map((p) => p.value)).toEqual(
      VENTILATION_PRESETS.map((p) => p.ventilationType)
    );
  });

  it('returns no presets for fields without any', () => {
    expect(presetsForCatalogField('uValueWm2K', 'heatingSystems')).toEqual([]);
    expect(presetsForCatalogField('installationType', 'heatingSystems')).toEqual([]);
    expect(presetsForCatalogField('orientation', 'walls')).toEqual([]);
  });
});
