import { describe, expect, it } from 'vitest';
import {
  Building,
  createImportReport,
  EmptyDpeInputError,
  inferred,
  measured,
  type BuildingInput,
  type ImportReport
} from '@hes/domain';
import {
  BuildingNotFoundError,
  GetBuildingUseCase,
  ImportDpeXmlUseCase,
  type BuildingRepository,
  type DpeImportResult,
  type DpeImporterPort,
  type SaveBuildingInput,
  type StoredBuilding
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function makeBuilding(id: string): Building {
  const input: BuildingInput = {
    id,
    dpeNumber: measured('X', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(50, 'dpe-xml:x', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date),
    levelCount: null,
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: inferred('logement', 'inference:single-zone-from-logement', 0.9, date), areaM2: null }],
    rooms: [],
    walls: [],
    roofs: [],
    floors: [],
    windows: [],
    doors: [],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date
  };
  return Building.createForImport(input);
}

function makeReport(): ImportReport {
  return createImportReport({
    dpeNumber: 'X',
    schemaVariant: 'modele=1/version=2',
    generatedAt: date,
    parsedFields: [],
    inferredFields: [],
    unrecognizedFields: [],
    missingFields: []
  });
}

class FakeImporter implements DpeImporterPort {
  calls: string[] = [];
  importDpeXml(dpeXml: string): DpeImportResult {
    this.calls.push(dpeXml);
    return { building: makeBuilding('11111111-1111-4111-8111-111111111111'), report: makeReport() };
  }
}

class FakeRepository implements BuildingRepository {
  saved: SaveBuildingInput[] = [];
  store = new Map<string, StoredBuilding>();
  save(input: SaveBuildingInput): Promise<string> {
    this.saved.push(input);
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return Promise.resolve(input.building.id);
  }
  findById(id: string): Promise<StoredBuilding | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
}

describe('ImportDpeXmlUseCase', () => {
  it('imports then persists and returns { buildingId, report }', async () => {
    const importer = new FakeImporter();
    const repository = new FakeRepository();
    const useCase = new ImportDpeXmlUseCase({ importer, repository });
    const result = await useCase.execute('<dpe/>');
    expect(result.buildingId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.report.reportVersion).toBe(1);
    expect(importer.calls).toEqual(['<dpe/>']);
    expect(repository.saved).toHaveLength(1);
  });

  it('rejects empty input before touching the importer', async () => {
    const importer = new FakeImporter();
    const useCase = new ImportDpeXmlUseCase({ importer, repository: new FakeRepository() });
    await expect(useCase.execute('  ')).rejects.toThrow(EmptyDpeInputError);
    expect(importer.calls).toHaveLength(0);
  });

  it('propagates importer errors (no silent catch)', async () => {
    const importer: DpeImporterPort = {
      importDpeXml: () => {
        throw new EmptyDpeInputError();
      }
    };
    const useCase = new ImportDpeXmlUseCase({ importer, repository: new FakeRepository() });
    await expect(useCase.execute('<dpe/>')).rejects.toThrow(EmptyDpeInputError);
  });
});

describe('GetBuildingUseCase', () => {
  it('returns the stored building and report', async () => {
    const repository = new FakeRepository();
    await repository.save({ building: makeBuilding('22222222-2222-4222-8222-222222222222'), report: makeReport() });
    const useCase = new GetBuildingUseCase({ repository });
    const result = await useCase.execute('22222222-2222-4222-8222-222222222222');
    expect(result.building.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.report.reportVersion).toBe(1);
  });

  it('throws BuildingNotFoundError on unknown id', async () => {
    const useCase = new GetBuildingUseCase({ repository: new FakeRepository() });
    await expect(useCase.execute('33333333-3333-4333-8333-333333333333')).rejects.toThrow(BuildingNotFoundError);
  });
});
