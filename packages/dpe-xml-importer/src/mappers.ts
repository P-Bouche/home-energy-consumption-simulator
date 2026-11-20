import type { Confidence } from '@hes/domain';
import type {
  BanCoordinates,
  Door,
  Floor,
  HeatingSystem,
  PhotovoltaicSystem,
  Roof,
  VentilationSystem,
  Wall,
  Window
} from '@hes/domain';
import type { ImportContext } from './import-context.ts';
import { childRecord, str } from './xml-utils.ts';

/**
 * Versioned inference rules used by the importer. Every rule has a stable
 * name (stored as `inference:<rule>` in Confidence.source) and a confidence
 * score strictly below 1, so inferred data is never presented as measured.
 *
 * Assumptions (documented per AGENTS.md §8):
 * - living area missing → the whole-building living area is a good proxy (0.8);
 * - ceiling height missing → 2.5 m, the conventional 3CL default (0.4);
 * - level count missing → single-level dwelling (0.5);
 * - the DPE describes one dwelling → one zone named after the logement
 *   section (0.9);
 * - thermal zone heated area missing → living area (0.7);
 * - element description missing → a positional label (0.3).
 */
export const INFERENCE_RULES = {
  LIVING_AREA_FROM_BUILDING_AREA: { rule: 'living-area-from-building-area', confidence: 0.8 },
  DEFAULT_CEILING_HEIGHT_2_5M: { rule: 'default-ceiling-height-2.5m', confidence: 0.4 },
  DEFAULT_LEVEL_COUNT_1: { rule: 'default-level-count-1', confidence: 0.5 },
  SINGLE_ZONE_FROM_LOGEMENT: { rule: 'single-zone-from-logement', confidence: 0.9 },
  THERMAL_ZONE_AREA_FROM_LIVING_AREA: { rule: 'thermal-zone-heated-area-from-living-area', confidence: 0.7 },
  DEFAULT_ELEMENT_LABEL: { rule: 'default-element-label', confidence: 0.3 },
  DEFAULT_COUNT_1: { rule: 'default-count-1', confidence: 0.5 }
} as const;

const numConv = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const strConv = (raw: string): string => raw;

/**
 * Mapped administrative data of a DPE document.
 */
export interface AdminMapping {
  readonly dpeNumber: Confidence<string> | null;
  readonly status: Confidence<string> | null;
  readonly address: Confidence<string> | null;
  readonly banId: Confidence<string> | null;
  readonly banCoordinates: BanCoordinates | null;
}

/**
 * Maps `dpe` root + `administratif` sections (identity, geolocation).
 */
export function mapAdministratif(dpe: Record<string, unknown>, ctx: ImportContext): AdminMapping {
  const admin = childRecord(dpe, 'administratif');
  const geo = admin === undefined ? undefined : childRecord(admin, 'geolocalisation');
  const adresses = geo === undefined ? undefined : childRecord(geo, 'adresses');
  const adresseBien = adresses === undefined ? undefined : childRecord(adresses, 'adresse_bien');

  for (const [path, value] of [
    ['dpe/administratif/date_etablissement_dpe', childRecord(dpe, 'administratif')?.['date_etablissement_dpe']],
    ['dpe/administratif/date_visite_diagnostiqueur', admin?.['date_visite_diagnostiqueur']],
    ['dpe/administratif/enum_modele_dpe_id', admin?.['enum_modele_dpe_id']],
    ['dpe/administratif/enum_version_id', admin?.['enum_version_id']]
  ] as const) {
    const s = str(value);
    if (s !== null) ctx.recordParsed(path, s);
  }

  const dpeNumber = ctx.measuredOrMissing('dpe/numero_dpe', str(dpe['numero_dpe']), strConv, 'numero_dpe missing');
  const status = ctx.measuredOrMissing('dpe/statut', str(dpe['statut']), strConv, 'statut missing');
  const address = adresseBien
    ? ctx.measuredOrMissing('dpe/administratif/geolocalisation/adresses/adresse_bien/adresse_brut', str(adresseBien['adresse_brut']), strConv, 'adresse_brut missing')
    : null;
  const banId = adresseBien
    ? ctx.measuredOrMissing('dpe/administratif/geolocalisation/adresses/adresse_bien/ban_id', str(adresseBien['ban_id']), strConv, 'ban_id missing')
    : null;
  for (const key of ['ban_label', 'code_postal_brut', 'nom_commune_brut', 'ban_postcode', 'ban_city', 'ban_citycode'] as const) {
    const s = adresseBien === undefined ? null : str(adresseBien[key]);
    if (s !== null) {
      ctx.recordParsed(`dpe/administratif/geolocalisation/adresses/adresse_bien/${key}`, s);
    }
  }
  let banCoordinates: BanCoordinates | null = null;
  if (adresseBien !== undefined) {
    const x = ctx.measuredOrMissing('dpe/administratif/geolocalisation/adresses/adresse_bien/ban_x', str(adresseBien['ban_x']), numConv, 'ban_x missing (no geolocation)');
    const y = ctx.measuredOrMissing('dpe/administratif/geolocalisation/adresses/adresse_bien/ban_y', str(adresseBien['ban_y']), numConv, 'ban_y missing (no geolocation)');
    if (x !== null && y !== null) {
      banCoordinates = { x, y };
    }
  }
  return { dpeNumber, status, address, banId, banCoordinates };
}

/**
 * Mapped general characteristics + meteo of the logement.
 */
export interface GeneralMapping {
  readonly constructionYear: Confidence<number> | null;
  readonly constructionPeriod: Confidence<string> | null;
  readonly livingAreaM2: Confidence<number> | null;
  readonly buildingLivingAreaM2: Confidence<number> | null;
  readonly ceilingHeightM: Confidence<number> | null;
  readonly levelCount: Confidence<number> | null;
  readonly apartmentCount: Confidence<number> | null;
  readonly climateZone: Confidence<string> | null;
  readonly altitudeClass: Confidence<string> | null;
  readonly altitudeM: Confidence<number> | null;
  readonly thermalInertiaClass: Confidence<string> | null;
}

/**
 * Maps `logement/caracteristique_generale`, `logement/meteo` and
 * `logement/enveloppe/inertie`, applying the versioned inference rules when
 * fields are absent.
 */
export function mapGeneral(logement: Record<string, unknown>, ctx: ImportContext): GeneralMapping {
  const cg = childRecord(logement, 'caracteristique_generale') ?? {};
  const meteo = childRecord(logement, 'meteo');
  const enveloppe = childRecord(logement, 'enveloppe');
  const inertie = enveloppe === undefined ? undefined : childRecord(enveloppe, 'inertie');

  const base = 'dpe/logement/caracteristique_generale';
  let livingAreaM2 = ctx.measuredOrMissing(`${base}/surface_habitable_logement`, str(cg['surface_habitable_logement']), numConv, 'surface_habitable_logement missing');
  const buildingLivingAreaM2 = ctx.measuredOrMissing(`${base}/surface_habitable_immeuble`, str(cg['surface_habitable_immeuble']), numConv, 'surface_habitable_immeuble missing');
  if (livingAreaM2 === null && buildingLivingAreaM2 !== null) {
    const r = INFERENCE_RULES.LIVING_AREA_FROM_BUILDING_AREA;
    livingAreaM2 = ctx.recordInferred(`${base}/surface_habitable_logement`, buildingLivingAreaM2.value, r.rule, r.confidence);
  }
  let ceilingHeightM = ctx.measuredOrMissing(`${base}/hsp`, str(cg['hsp']), numConv, 'hsp missing');
  if (ceilingHeightM === null) {
    const r = INFERENCE_RULES.DEFAULT_CEILING_HEIGHT_2_5M;
    ceilingHeightM = ctx.recordInferred(`${base}/hsp`, 2.5, r.rule, r.confidence);
  }
  let levelCount = ctx.measuredOrMissing(`${base}/nombre_niveau_logement`, str(cg['nombre_niveau_logement']), numConv, 'nombre_niveau_logement missing');
  if (levelCount === null) {
    const r = INFERENCE_RULES.DEFAULT_LEVEL_COUNT_1;
    levelCount = ctx.recordInferred(`${base}/nombre_niveau_logement`, 1, r.rule, r.confidence);
  }

  return {
    constructionYear: ctx.measuredOrMissing(`${base}/annee_construction`, str(cg['annee_construction']), numConv, 'annee_construction missing (no inference rule; period enum kept if present)'),
    constructionPeriod: ctx.measuredOrMissing(`${base}/enum_periode_construction_id`, str(cg['enum_periode_construction_id']), strConv, 'enum_periode_construction_id missing'),
    livingAreaM2,
    buildingLivingAreaM2,
    ceilingHeightM,
    levelCount,
    apartmentCount: ctx.measuredOrMissing(`${base}/nombre_appartement`, str(cg['nombre_appartement']), numConv, 'nombre_appartement missing'),
    climateZone: meteo === undefined ? null : ctx.measuredOrMissing('dpe/logement/meteo/enum_zone_climatique_id', str(meteo['enum_zone_climatique_id']), strConv, 'enum_zone_climatique_id missing'),
    altitudeClass: meteo === undefined ? null : ctx.measuredOrMissing('dpe/logement/meteo/enum_classe_altitude_id', str(meteo['enum_classe_altitude_id']), strConv, 'enum_classe_altitude_id missing'),
    altitudeM: meteo === undefined ? null : ctx.measuredOrMissing('dpe/logement/meteo/altitude', str(meteo['altitude']), numConv, 'altitude missing'),
    thermalInertiaClass: inertie === undefined ? null : ctx.measuredOrMissing('dpe/logement/enveloppe/inertie/enum_classe_inertie_id', str(inertie['enum_classe_inertie_id']), strConv, 'enum_classe_inertie_id missing')
  };
}

interface EnvelopeMapping {
  readonly walls: Wall[];
  readonly roofs: Roof[];
  readonly floors: Floor[];
  readonly windows: Window[];
  readonly doors: Door[];
}

/**
 * Maps `logement/enveloppe` collections to Wall / Roof / Floor / Window /
 * Door entities owned by the building.
 */
export function mapEnveloppe(
  logement: Record<string, unknown>,
  ctx: ImportContext,
  buildingId: string
): EnvelopeMapping {
  const enveloppe = childRecord(logement, 'enveloppe') ?? {};

  const walls: Wall[] = [];
  const murs = childRecord(enveloppe, 'mur_collection')?.['mur'];
  const murItems = murs === undefined ? [] : Array.isArray(murs) ? murs : [murs];
  murItems.forEach((item, i) => {
    const base = `dpe/logement/enveloppe/mur_collection/mur[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'wall description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `mur ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    const areaM2 = ctx.measuredOrMissing(`${base}/donnee_entree/surface_paroi_totale`, str(de['surface_paroi_totale']), numConv, 'wall surface missing')
      ?? ctx.measuredOrMissing(`${base}/donnee_entree/surface_paroi_opaque`, str(de['surface_paroi_opaque']), numConv, 'wall surface missing');
    walls.push({
      kind: 'wall',
      id: `wall-${i + 1}`,
      buildingId,
      description,
      areaM2,
      uValueWm2K: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/umur`, str(di['umur']), numConv, 'umur missing'),
      orientation: ctx.measuredOrMissing(`${base}/donnee_entree/enum_orientation_id`, str(de['enum_orientation_id']), strConv, 'orientation missing'),
      wallType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_materiaux_structure_mur_id`, str(de['enum_materiaux_structure_mur_id']), strConv, 'wall type missing'),
      adjacencyType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_adjacence_id`, str(de['enum_type_adjacence_id']), strConv, 'adjacency type missing')
    });
  });

  const roofs: Roof[] = [];
  const ph = childRecord(enveloppe, 'plancher_haut_collection')?.['plancher_haut'];
  const phItems = ph === undefined ? [] : Array.isArray(ph) ? ph : [ph];
  phItems.forEach((item, i) => {
    const base = `dpe/logement/enveloppe/plancher_haut_collection/plancher_haut[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'roof description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `plancher_haut ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    roofs.push({
      kind: 'roof',
      id: `roof-${i + 1}`,
      buildingId,
      description,
      areaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_paroi_opaque`, str(de['surface_paroi_opaque']), numConv, 'roof surface missing'),
      uValueWm2K: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/uph`, str(di['uph']), numConv, 'uph missing'),
      roofType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_plancher_haut_id`, str(de['enum_type_plancher_haut_id']), strConv, 'roof type missing'),
      adjacencyType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_adjacence_id`, str(de['enum_type_adjacence_id']), strConv, 'adjacency type missing')
    });
  });

  const floors: Floor[] = [];
  const pb = childRecord(enveloppe, 'plancher_bas_collection')?.['plancher_bas'];
  const pbItems = pb === undefined ? [] : Array.isArray(pb) ? pb : [pb];
  pbItems.forEach((item, i) => {
    const base = `dpe/logement/enveloppe/plancher_bas_collection/plancher_bas[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'floor description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `plancher_bas ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    floors.push({
      kind: 'floor',
      id: `floor-${i + 1}`,
      buildingId,
      description,
      areaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_paroi_opaque`, str(de['surface_paroi_opaque']), numConv, 'floor surface missing'),
      uValueWm2K: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/upb`, str(di['upb']), numConv, 'upb missing'),
      floorType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_plancher_bas_id`, str(de['enum_type_plancher_bas_id']), strConv, 'floor type missing'),
      adjacencyType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_adjacence_id`, str(de['enum_type_adjacence_id']), strConv, 'adjacency type missing')
    });
  });

  const windows: Window[] = [];
  const baies = childRecord(enveloppe, 'baie_vitree_collection')?.['baie_vitree'];
  const baieItems = baies === undefined ? [] : Array.isArray(baies) ? baies : [baies];
  baieItems.forEach((item, i) => {
    const base = `dpe/logement/enveloppe/baie_vitree_collection/baie_vitree[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'window description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `baie_vitree ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    windows.push({
      kind: 'window',
      id: `window-${i + 1}`,
      buildingId,
      description,
      areaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_totale_baie`, str(de['surface_totale_baie']), numConv, 'window surface missing (surface_totale_baie is used as-is; nb_baie is kept separately)'),
      uValueWm2K: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/uw`, str(di['uw']), numConv, 'uw missing'),
      orientation: ctx.measuredOrMissing(`${base}/donnee_entree/enum_orientation_id`, str(de['enum_orientation_id']), strConv, 'orientation missing'),
      count: ctx.measuredOrMissing(`${base}/donnee_entree/nb_baie`, str(de['nb_baie']), numConv, 'nb_baie missing')
        ?? ctx.recordInferred(`${base}/donnee_entree/nb_baie`, 1, INFERENCE_RULES.DEFAULT_COUNT_1.rule, INFERENCE_RULES.DEFAULT_COUNT_1.confidence),
      solarFactorSw: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/sw`, str(di['sw']), numConv, 'sw missing'),
      glazingType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_vitrage_id`, str(de['enum_type_vitrage_id']), strConv, 'glazing type missing'),
      frameMaterial: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_materiaux_menuiserie_id`, str(de['enum_type_materiaux_menuiserie_id']), strConv, 'frame material missing')
    });
  });

  const doors: Door[] = [];
  const portes = childRecord(enveloppe, 'porte_collection')?.['porte'];
  const porteItems = portes === undefined ? [] : Array.isArray(portes) ? portes : [portes];
  porteItems.forEach((item, i) => {
    const base = `dpe/logement/enveloppe/porte_collection/porte[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'door description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `porte ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    doors.push({
      kind: 'door',
      id: `door-${i + 1}`,
      buildingId,
      description,
      areaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_porte`, str(de['surface_porte']), numConv, 'door surface missing'),
      uValueWm2K: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/uporte`, str(di['uporte']), numConv, 'uporte missing'),
      doorType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_porte_id`, str(de['enum_type_porte_id']), strConv, 'door type missing'),
      count: ctx.measuredOrMissing(`${base}/donnee_entree/nb_porte`, str(de['nb_porte']), numConv, 'nb_porte missing')
        ?? ctx.recordInferred(`${base}/donnee_entree/nb_porte`, 1, INFERENCE_RULES.DEFAULT_COUNT_1.rule, INFERENCE_RULES.DEFAULT_COUNT_1.confidence)
    });
  });

  return { walls, roofs, floors, windows, doors };
}

/**
 * Mapped systems of the logement.
 */
export interface SystemsMapping {
  readonly heatingSystems: HeatingSystem[];
  readonly ventilationSystems: VentilationSystem[];
  readonly photovoltaicSystems: PhotovoltaicSystem[];
}

/**
 * Maps `installation_chauffage_collection`, `ventilation_collection` and
 * `production_elec_enr/panneaux_pv_collection`.
 */
export function mapSystems(
  logement: Record<string, unknown>,
  ctx: ImportContext,
  buildingId: string
): SystemsMapping {
  const heatingSystems: HeatingSystem[] = [];
  const ch = childRecord(logement, 'installation_chauffage_collection')?.['installation_chauffage'];
  const chItems = ch === undefined ? [] : Array.isArray(ch) ? ch : [ch];
  chItems.forEach((item, i) => {
    const base = `dpe/logement/installation_chauffage_collection/installation_chauffage[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'heating description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `installation_chauffage ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    heatingSystems.push({
      id: `heating-${i + 1}`,
      buildingId,
      description,
      installationType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_installation_id`, str(de['enum_type_installation_id']), strConv, 'installation type missing'),
      heatedAreaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_chauffee`, str(de['surface_chauffee']), numConv, 'surface_chauffee missing')
    });
  });

  const ventilationSystems: VentilationSystem[] = [];
  const vent = childRecord(logement, 'ventilation_collection')?.['ventilation'];
  const ventItems = vent === undefined ? [] : Array.isArray(vent) ? vent : [vent];
  ventItems.forEach((item, i) => {
    const base = `dpe/logement/ventilation_collection/ventilation[${i + 1}]`;
    const de = childRecord(item, 'donnee_entree') ?? {};
    const di = childRecord(item, 'donnee_intermediaire');
    const description = ctx.measuredOrMissing(`${base}/donnee_entree/description`, str(de['description']), strConv, 'ventilation description missing')
      ?? ctx.recordInferred(`${base}/donnee_entree/description`, `ventilation ${i + 1}`, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.rule, INFERENCE_RULES.DEFAULT_ELEMENT_LABEL.confidence);
    ventilationSystems.push({
      id: `ventilation-${i + 1}`,
      buildingId,
      description,
      ventilationType: ctx.measuredOrMissing(`${base}/donnee_entree/enum_type_ventilation_id`, str(de['enum_type_ventilation_id']), strConv, 'ventilation type missing'),
      ventilatedAreaM2: ctx.measuredOrMissing(`${base}/donnee_entree/surface_ventile`, str(de['surface_ventile']), numConv, 'surface_ventile missing'),
      q4paConv: di === undefined ? null : ctx.measuredOrMissing(`${base}/donnee_intermediaire/q4pa_conv`, str(di['q4pa_conv']), numConv, 'q4pa_conv missing')
    });
  });

  const photovoltaicSystems: PhotovoltaicSystem[] = [];
  const pv = childRecord(childRecord(logement, 'production_elec_enr') ?? {}, 'panneaux_pv_collection')?.['panneaux_pv'];
  const pvItems = pv === undefined ? [] : Array.isArray(pv) ? pv : [pv];
  pvItems.forEach((item, i) => {
    const base = `dpe/logement/production_elec_enr/panneaux_pv_collection/panneaux_pv[${i + 1}]`;
    photovoltaicSystems.push({
      id: `pv-${i + 1}`,
      buildingId,
      sensorAreaM2: ctx.measuredOrMissing(`${base}/surface_totale_capteurs`, str((item as Record<string, unknown>)['surface_totale_capteurs']), numConv, 'surface_totale_capteurs missing'),
      moduleCount: ctx.measuredOrMissing(`${base}/nombre_module`, str((item as Record<string, unknown>)['nombre_module']), numConv, 'nombre_module missing'),
      orientation: ctx.measuredOrMissing(`${base}/enum_orientation_pv_id`, str((item as Record<string, unknown>)['enum_orientation_pv_id']), strConv, 'PV orientation missing'),
      inclination: ctx.measuredOrMissing(`${base}/enum_inclinaison_pv_id`, str((item as Record<string, unknown>)['enum_inclinaison_pv_id']), strConv, 'PV inclination missing')
    });
  });

  return { heatingSystems, ventilationSystems, photovoltaicSystems };
}
