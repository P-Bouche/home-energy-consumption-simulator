import { describe, expect, it } from 'vitest';
import {
  ENERGY_LABELS,
  createSimulationResult,
  isEnergyLabel,
  type SimulationResultInput
} from '@hes/domain';
import {
  EngineExecutionError,
  InvalidDpeError,
  SimulationError,
  SimulationMappingError,
  UnsupportedDpeModelError
} from '@hes/domain';

const validInput: SimulationResultInput = {
  consumptionKwh: 48522.767,
  emissionsKg: 7770.9,
  energyLabel: 'D',
  climateLabel: 'D',
  rawEngineOutput: { logement: { sortie: {} } }
};

describe('isEnergyLabel', () => {
  it('accepts every letter A..G', () => {
    for (const label of ENERGY_LABELS) {
      expect(isEnergyLabel(label)).toBe(true);
    }
  });

  it('rejects non-letters and non-strings', () => {
    expect(isEnergyLabel('H')).toBe(false);
    expect(isEnergyLabel('a')).toBe(false);
    expect(isEnergyLabel(4)).toBe(false);
    expect(isEnergyLabel(undefined)).toBe(false);
  });
});

describe('createSimulationResult', () => {
  it('builds an immutable, frozen result from valid input', () => {
    const result = createSimulationResult(validInput);
    expect(result.consumptionKwh).toBe(validInput.consumptionKwh);
    expect(result.emissionsKg).toBe(validInput.emissionsKg);
    expect(result.energyLabel).toBe('D');
    expect(result.climateLabel).toBe('D');
    expect(result.rawEngineOutput).toEqual(validInput.rawEngineOutput);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects negative or non-finite consumption', () => {
    expect(() => createSimulationResult({ ...validInput, consumptionKwh: -1 })).toThrow(RangeError);
    expect(() =>
      createSimulationResult({ ...validInput, consumptionKwh: Number.NaN })
    ).toThrow(RangeError);
  });

  it('rejects negative or non-finite emissions', () => {
    expect(() => createSimulationResult({ ...validInput, emissionsKg: -0.5 })).toThrow(RangeError);
    expect(() =>
      createSimulationResult({ ...validInput, emissionsKg: Number.POSITIVE_INFINITY })
    ).toThrow(RangeError);
  });

  it('rejects invalid labels', () => {
    expect(() =>
      createSimulationResult({ ...validInput, energyLabel: 'H' as never })
    ).toThrow(TypeError);
    expect(() =>
      createSimulationResult({ ...validInput, climateLabel: 3 as never })
    ).toThrow(TypeError);
  });
});

describe('domain errors', () => {
  it('all extend SimulationError and carry a stable code', () => {
    const errors = [
      new InvalidDpeError('bad xml'),
      new UnsupportedDpeModelError('model'),
      new EngineExecutionError('boom', { cause: new Error('root') }),
      new SimulationMappingError('map')
    ];
    const codes = ['INVALID_DPE', 'UNSUPPORTED_DPE_MODEL', 'ENGINE_EXECUTION', 'MAPPING'];
    errors.forEach((error, index) => {
      expect(error).toBeInstanceOf(SimulationError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(codes[index]);
      expect(error.message).toBeTruthy();
    });
    expect(new EngineExecutionError('boom', { cause: new Error('root') }).cause).toBeInstanceOf(
      Error
    );
  });
});
