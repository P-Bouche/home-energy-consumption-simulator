import { describe, expect, it } from 'vitest';
import { buildingDisplayName } from '../src/components/BuildingLabel.tsx';

describe('buildingDisplayName (UX audit US 11, issue #27)', () => {
  it('derives the human label from the DPE number of the import report', () => {
    expect(buildingDisplayName('2238E0097309E')).toBe('DPE 2238E0097309E');
  });

  it('falls back to a neutral label when the DPE has no number', () => {
    expect(buildingDisplayName(null)).toBe('bâtiment importé');
    expect(buildingDisplayName('  ')).toBe('bâtiment importé');
  });
});
