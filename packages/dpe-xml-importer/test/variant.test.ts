import { describe, expect, it } from 'vitest';
import { detectVariant, parseDpeXml } from '../src/index.ts';

describe('detectVariant', () => {
  it('detects the variant from a parsed document', () => {
    const doc = parseDpeXml(
      '<dpe><administratif><enum_modele_dpe_id>1</enum_modele_dpe_id><enum_version_id>2.4</enum_version_id></administratif></dpe>'
    );
    expect(detectVariant(doc)).toBe('modele=1/version=2.4');
  });

  it('returns unknown when the enums are missing', () => {
    expect(detectVariant({})).toBe('unknown');
    expect(detectVariant(parseDpeXml('<dpe></dpe>'))).toBe('unknown');
  });
});
