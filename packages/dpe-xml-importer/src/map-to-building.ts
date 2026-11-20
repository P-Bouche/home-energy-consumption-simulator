import { randomUUID } from 'node:crypto';
import { Building, DpeSchemaValidationError, type BuildingInput, type Confidence } from '@hes/domain';
import type { DpeImportResult } from '@hes/application';
import { ImportContext } from './import-context.ts';
import { mapAdministratif, mapEnveloppe, mapGeneral, mapSystems, INFERENCE_RULES } from './mappers.ts';
import { childRecord, str } from './xml-utils.ts';

/**
 * Maps a validated parsed DPE document to the domain Building aggregate and
 * builds the ImportReport v1.
 *
 * @param doc - parsed XML tree (output of parseDpeXml, validated)
 * @param schemaVariant - detected variant string (e.g. "modele=1/version=2.3")
 * @param importDate - date stamped on every Confidence value
 */
export function mapToBuilding(
  doc: unknown,
  schemaVariant: string,
  importDate: Date,
  sourceDpeXml?: string
): DpeImportResult {
  const ctx = new ImportContext(importDate);
  const dpe = childRecord(doc, 'dpe');
  if (dpe === undefined) {
    throw new DpeSchemaValidationError(['dpe: root element <dpe> is missing']);
  }
  const logement = childRecord(dpe, 'logement') ?? {};

  const admin = mapAdministratif(dpe, ctx);
  const general = mapGeneral(logement, ctx);
  const buildingId = randomUUID();
  const envelope = mapEnveloppe(logement, ctx, buildingId);
  const systems = mapSystems(logement, ctx, buildingId);

  const r = INFERENCE_RULES;
  const zone = {
    id: 'zone-1',
    name: ctx.recordInferred('logement/zone', 'logement', r.SINGLE_ZONE_FROM_LOGEMENT.rule, r.SINGLE_ZONE_FROM_LOGEMENT.confidence),
    areaM2: general.livingAreaM2
  };
  ctx.recordMissing('logement/rooms', 'DPE XML v1 does not describe rooms; the aggregate keeps a single zone without rooms');

  let heatedArea: Confidence<number> | null =
    systems.heatingSystems.find((h) => h.heatedAreaM2 !== null)?.heatedAreaM2 ?? null;
  if (heatedArea === null && general.livingAreaM2 !== null) {
    heatedArea = general.livingAreaM2;
  }
  if (heatedArea === null) {
    ctx.recordMissing(
      'logement/thermal_zone/heated_area',
      'no surface_chauffee in the heating installations and no living area to infer it from'
    );
  }
  const thermalZone = {
    id: 'thermal-zone-1',
    buildingId,
    name: ctx.recordInferred('logement/thermal_zone', 'zone thermique du logement', r.SINGLE_ZONE_FROM_LOGEMENT.rule, r.SINGLE_ZONE_FROM_LOGEMENT.confidence),
    heatedAreaM2: heatedArea
  };

  const input: BuildingInput = {
    id: buildingId,
    dpeNumber: admin.dpeNumber,
    status: admin.status,
    address: admin.address,
    banId: admin.banId,
    banCoordinates: admin.banCoordinates,
    constructionYear: general.constructionYear,
    constructionPeriod: general.constructionPeriod,
    livingAreaM2: general.livingAreaM2,
    buildingLivingAreaM2: general.buildingLivingAreaM2,
    ceilingHeightM: general.ceilingHeightM,
    levelCount: general.levelCount,
    apartmentCount: general.apartmentCount,
    climateZone: general.climateZone,
    altitudeClass: general.altitudeClass,
    altitudeM: general.altitudeM,
    thermalInertiaClass: general.thermalInertiaClass,
    zones: [zone],
    rooms: [],
    walls: envelope.walls,
    roofs: envelope.roofs,
    floors: envelope.floors,
    windows: envelope.windows,
    doors: envelope.doors,
    thermalZones: [thermalZone],
    heatingSystems: systems.heatingSystems,
    ventilationSystems: systems.ventilationSystems,
    photovoltaicSystems: systems.photovoltaicSystems,
    importedAt: importDate,
    sourceDpeXml: typeof sourceDpeXml === 'string' ? sourceDpeXml : null
  };
  const building = Building.createForImport(input);
  const report = ctx.buildReport({
    dpeNumber: str(dpe['numero_dpe']),
    schemaVariant,
    doc
  });
  return { building, report };
}
