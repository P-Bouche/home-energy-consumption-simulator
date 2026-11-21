import { describe, expect, it } from 'vitest';
import {
  ComparisonService,
  createSimulationResultRecord,
  energyLabelRank,
  labelChange,
  type ComparisonEntryInput,
  type SimulationResultRecord
} from '@hes/domain';
import { testDate } from './helpers.ts';

function makeRecord(overrides: Partial<Parameters<typeof createSimulationResultRecord>[0]>): SimulationResultRecord {
  return createSimulationResultRecord({
    id: 'r',
    buildingId: '11111111-1111-4111-8111-111111111111',
    inputHash: 'a'.repeat(64),
    engineVersion: '1.11.6',
    createdAt: testDate,
    consumptionKwh: 16400,
    emissionsKg: 3413,
    energyLabel: 'D',
    climateLabel: 'D',
    rawEngineOutput: {},
    ...overrides
  });
}

const baseline = makeRecord({ id: 'baseline', inputHash: 'b'.repeat(64) });

let entryCounter = 0;
function entry(scenarioId: string, name: string, consumptionKwh: number, emissionsKg: number, energyLabel: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', climateLabel: typeof energyLabel): ComparisonEntryInput {
  entryCounter += 1;
  return {
    scenarioId,
    name,
    baselineVersion: 0,
    result: makeRecord({
      id: `res-${scenarioId}`,
      inputHash: entryCounter.toString(16).padStart(64, '0'),
      consumptionKwh,
      emissionsKg,
      energyLabel,
      climateLabel
    })
  };
}

describe('ComparisonService.compare (P5: pure domain computation)', () => {
  it('computes deltas vs baseline (negative = saved) and ranks by kWh saved', () => {
    const comparison = ComparisonService.compare(
      baseline,
      [
        entry('s1', 'Walls', 11334, 2266, 'C', 'C'),
        entry('s2', 'Windows', 13604, 2780, 'C', 'D'),
        entry('s3', 'Nothing', 16400, 3413, 'D', 'D')
      ],
      { now: testDate }
    );
    expect(comparison.buildingId).toBe(baseline.buildingId);
    expect(comparison.baseline.id).toBe('baseline');
    expect(comparison.generatedAt).toEqual(testDate);

    const [best, second, worst] = comparison.entries;
    expect(best?.scenarioId).toBe('s1');
    expect(best?.rank).toBe(1);
    expect(best?.deltaKwh).toBeCloseTo(11334 - 16400);
    expect(best?.deltaKgCo2).toBeCloseTo(2266 - 3413);
    expect(second?.scenarioId).toBe('s2');
    expect(second?.rank).toBe(2);
    expect(worst?.scenarioId).toBe('s3');
    expect(worst?.deltaKwh).toBe(0);
    expect(worst?.rank).toBe(3);
  });

  it('computes label changes (D -> C) and null when unchanged', () => {
    const comparison = ComparisonService.compare(
      baseline,
      [entry('s1', 'Walls', 11334, 2266, 'C', 'C'), entry('s3', 'Nothing', 16400, 3413, 'D', 'D')],
      { now: testDate }
    );
    const walls = comparison.entries.find((e) => e.scenarioId === 's1');
    const nothing = comparison.entries.find((e) => e.scenarioId === 's3');
    expect(walls?.energyLabelChange).toEqual({ from: 'D', to: 'C' });
    expect(walls?.climateLabelChange).toEqual({ from: 'D', to: 'C' });
    expect(nothing?.energyLabelChange).toBeNull();
    expect(nothing?.climateLabelChange).toBeNull();
  });

  it('breaks kWh ties by kg CO2 then by scenario id (deterministic)', () => {
    const comparison = ComparisonService.compare(
      baseline,
      [entry('sB', 'b', 10000, 2000, 'C', 'C'), entry('sA', 'a', 10000, 1500, 'C', 'C'), entry('sC', 'c', 10000, 1500, 'C', 'C')],
      { now: testDate }
    );
    expect(comparison.entries.map((e) => e.scenarioId)).toEqual(['sA', 'sC', 'sB']);
    expect(comparison.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('handles an empty scenario list', () => {
    const comparison = ComparisonService.compare(baseline, [], { now: testDate });
    expect(comparison.entries).toHaveLength(0);
  });

  it('labelChange and energyLabelRank helpers', () => {
    expect(labelChange('D', 'C')).toEqual({ from: 'D', to: 'C' });
    expect(labelChange('C', 'C')).toBeNull();
    expect(energyLabelRank('A')).toBe(0);
    expect(energyLabelRank('G')).toBe(6);
  });
});
