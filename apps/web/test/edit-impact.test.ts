import { describe, expect, it } from 'vitest';
import {
  fieldDiffLine,
  formatPlainValue,
  formatSignedDelta,
  impactSummaryLine,
  labelChangeText,
  previousResult
} from '../src/services/edit-impact.ts';
import type {
  AuditEntryJson,
  BuildingCommandJson,
  ConfidenceJson,
  FieldChangeJson,
  SimulationResultJson
} from '../src/types.ts';

function conf<T>(value: T, source = 'dpe-xml:dpe/logement/...', confidence = 1): ConfidenceJson<T> {
  return { value, source, confidence, importDate: '2026-11-21T10:00:00.000Z' };
}

function result(overrides: Partial<SimulationResultJson>): SimulationResultJson {
  return {
    id: 'r1',
    buildingId: 'b1',
    inputHash: 'h1',
    engineVersion: '1.11.6',
    createdAt: '2026-11-21T10:00:00.000Z',
    consumptionKwh: 10_000,
    consumptionKwhM2An: 200,
    emissionsKg: 2_000,
    emissionsKgCo2M2An: 40,
    energyLabel: 'D',
    climateLabel: 'D',
    rawEngineOutput: {},
    ...overrides
  };
}

function wallCommand(): BuildingCommandJson {
  return { type: 'building.wall.update.v1', buildingId: 'b1', wallId: 'wall-1', uValueWm2K: 0.2 };
}

describe('formatSignedDelta', () => {
  it('formats a negative delta with a minus sign and French grouping', () => {
    const grouped = (1234).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    expect(formatSignedDelta(-1234, 'kWh/an')).toBe(`−${grouped} kWh/an`);
  });

  it('formats a positive delta with an explicit + sign', () => {
    expect(formatSignedDelta(500, 'kg CO₂e/an')).toBe('+500 kg CO₂e/an');
  });

  it('formats a zero delta honestly as 0', () => {
    expect(formatSignedDelta(0, 'kWh/an')).toBe('0 kWh/an');
  });
});

describe('labelChangeText', () => {
  it('renders a label change « étiquette D → C »', () => {
    expect(labelChangeText('D', 'C')).toBe('étiquette D → C');
  });

  it('renders an unchanged label honestly « étiquette D inchangé »', () => {
    expect(labelChangeText('D', 'D')).toBe('étiquette D inchangé');
  });

  it('renders no comparison when there is no baseline (first run)', () => {
    expect(labelChangeText(null, 'D')).toBe('étiquette D');
  });
});

describe('impactSummaryLine', () => {
  it('shows the result without any delta when there is no previous result', () => {
    const kwh = (12_345).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    const line = impactSummaryLine(null, result({ consumptionKwh: 12_345, energyLabel: 'D' }));
    expect(line).toBe(`Simulation : étiquette D, ${kwh} kWh/an`);
    expect(line).not.toContain('relancée');
    expect(line).not.toContain('→');
  });

  it('renders « Simulation relancée : −X kWh/an, étiquette D → C » plus the CO₂ delta when it changes', () => {
    const before = result({ id: 'r0', consumptionKwh: 10_000, emissionsKg: 2_000, energyLabel: 'D' });
    const after = result({ id: 'r1', consumptionKwh: 8_766, emissionsKg: 1_700, energyLabel: 'C' });
    const kwh = (1234).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    const co2 = (300).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    expect(impactSummaryLine(before, after)).toBe(
      `Simulation relancée : −${kwh} kWh/an, étiquette D → C, −${co2} kg CO₂e/an`
    );
  });

  it('omits the CO₂ delta when emissions do not change', () => {
    const before = result({ id: 'r0', consumptionKwh: 10_000, emissionsKg: 2_000, energyLabel: 'D' });
    const after = result({ id: 'r1', consumptionKwh: 9_500, emissionsKg: 2_000, energyLabel: 'D' });
    const line = impactSummaryLine(before, after);
    expect(line).toContain('étiquette D inchangé');
    expect(line).not.toContain('CO₂');
  });

  it('renders a positive delta with + when the edit raises consumption', () => {
    const before = result({ id: 'r0', consumptionKwh: 8_000, energyLabel: 'C' });
    const after = result({ id: 'r1', consumptionKwh: 10_000, emissionsKg: 2_000, energyLabel: 'D' });
    const grouped = (2000).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    const line = impactSummaryLine(before, after);
    expect(line).toContain(`+${grouped} kWh/an`);
    expect(line).toContain('étiquette C → D');
  });
});

describe('previousResult', () => {
  const older = result({ id: 'r0', inputHash: 'h0' });
  const newer = result({ id: 'r1', inputHash: 'h1' });

  it('returns the history entry just older than the current result (newest-first history)', () => {
    expect(previousResult([newer, older], newer)).toBe(older);
  });

  it('returns null when the current result is the only one (first run)', () => {
    expect(previousResult([newer], newer)).toBeNull();
  });

  it('returns null when there is no current result or it is unknown to the history', () => {
    expect(previousResult([newer, older], null)).toBeNull();
    expect(previousResult([newer, older], result({ id: 'rX' }))).toBeNull();
  });
});

describe('formatPlainValue', () => {
  it('formats U values with two decimals and a French decimal comma', () => {
    expect(formatPlainValue(conf(1.6393), 'uValueWm2K')).toBe('1,64');
    expect(formatPlainValue(conf(0.2), 'uValueWm2K')).toBe('0,20');
  });

  it('formats other numbers with at most two decimals, French decimal comma', () => {
    expect(formatPlainValue(conf(54.25), 'areaM2')).toBe('54,25');
    expect(formatPlainValue(conf(54), 'areaM2')).toBe('54');
  });

  it('renders strings as they are and a missing value as « aucune valeur »', () => {
    expect(formatPlainValue(conf('2'), 'orientation')).toBe('2');
    expect(formatPlainValue(null, 'uValueWm2K')).toBe('aucune valeur');
  });
});

describe('fieldDiffLine', () => {
  const change: FieldChangeJson = {
    field: 'uValueWm2K',
    oldValue: conf(1.6393),
    newValue: { value: 0.2, source: 'user', confidence: 1, importDate: '2026-11-21T11:00:00.000Z' }
  };

  it('renders « U du mur wall-1 : 1,64 → 0,20 » for a wall U change', () => {
    expect(fieldDiffLine(wallCommand(), change)).toBe('U du mur wall-1 : 1,64 → 0,20');
  });

  it('renders Uw for a window U change', () => {
    const command: BuildingCommandJson = {
      type: 'building.window.update.v1',
      buildingId: 'b1',
      windowId: 'window-1',
      uValueWm2K: 1.1
    };
    expect(fieldDiffLine(command, change)).toBe('Uw de la fenêtre window-1 : 1,64 → 0,20');
  });

  it('renders other fields with their plain French label and element phrase', () => {
    const areaChange: FieldChangeJson = { field: 'areaM2', oldValue: conf(54.25), newValue: conf(60) };
    expect(fieldDiffLine(wallCommand(), areaChange)).toBe('surface du mur wall-1 : 54,25 → 60');
    const descChange: FieldChangeJson = { field: 'description', oldValue: conf('avant'), newValue: conf('après') };
    expect(fieldDiffLine(wallCommand(), descChange)).toBe('description du mur wall-1 : avant → après');
  });

  it('falls back to the raw command type for unknown kinds', () => {
    const command = { type: 'building.unknown.update.v1', buildingId: 'b1' } as unknown as BuildingCommandJson;
    expect(fieldDiffLine(command, change)).toContain('U de building.unknown.update.v1');
  });
});

describe('impactSummaryLine uses the audit-entry command shapes end to end', () => {
  it('matches the fixture wording for wall-1 U 1,6393 → 0,20 with label D → C', () => {
    const entry = {
      id: 'a1',
      buildingId: 'b1',
      userId: 'local-user',
      timestamp: '2026-11-21T11:00:00.000Z',
      commandType: 'building.wall.update.v1',
      command: wallCommand(),
      changes: [
        {
          field: 'uValueWm2K',
          oldValue: conf(1.6393),
          newValue: { value: 0.2, source: 'user', confidence: 1, importDate: '2026-11-21T11:00:00.000Z' }
        }
      ] as readonly FieldChangeJson[],
      version: 1
    } as AuditEntryJson;
    expect(fieldDiffLine(entry.command, entry.changes[0]!)).toBe('U du mur wall-1 : 1,64 → 0,20');
    const before = result({ id: 'r0', consumptionKwh: 10_000, emissionsKg: 2_000, energyLabel: 'D' });
    const after = result({ id: 'r1', consumptionKwh: 9_000, emissionsKg: 1_800, energyLabel: 'C' });
    expect(impactSummaryLine(before, after)).toContain('étiquette D → C');
  });
});
