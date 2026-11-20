import { describe, expect, it } from 'vitest';
import type { GeometryPort } from '@hes/application';
import { ReconstructionService } from '@hes/domain';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GeometryAdapter } from '../src/index.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const importDate = new Date('2026-11-20T12:00:00.000Z');

describe('GeometryAdapter (GeometryPort implementation)', () => {
  it('implements GeometryPort and delegates to the domain ReconstructionService', () => {
    const adapter: GeometryPort = new GeometryAdapter();
    const xml = readFileSync(`${fixturesDir}/2238E0097309E.xml`, 'utf8');
    const building = new DpeXmlImporter().importDpeXml(xml, importDate).building;
    const viaAdapter = adapter.reconstruct(building);
    const viaDomain = new ReconstructionService().reconstruct(building);
    expect(viaAdapter.meshHash).toBe(viaDomain.meshHash);
    expect(JSON.stringify(viaAdapter)).toBe(JSON.stringify(viaDomain));
    expect(building.reconstructGeometry().meshHash).toBe(viaDomain.meshHash);
  });
});
