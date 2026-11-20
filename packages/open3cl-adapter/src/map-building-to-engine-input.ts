import { isMeasured, type BuildingSimulationView, type Confidence } from '@hes/domain';

/**
 * Engine input produced by {@link buildEngineInput}: either the verbatim
 * retained DPE XML document, or a DPE JSON object reconstructed field-wise
 * from the domain view.
 */
export type EngineInput =
  | { readonly kind: 'xml'; readonly xml: string }
  | { readonly kind: 'json'; readonly json: Record<string, unknown> };

/**
 * One engine-input default applied because the domain field was absent or
 * inferred. Logged (never silent) with the source and confidence of the rule
 * that produced it.
 */
export interface MappingDefault {
  readonly path: string;
  readonly value: unknown;
  readonly source: string;
  readonly confidence: number;
}

/**
 * Result of {@link buildEngineInput}.
 */
export interface EngineInputMapping {
  readonly input: EngineInput;
  readonly defaults: readonly MappingDefault[];
  /**
   * True when the engine input is the verbatim retained source document
   * (confidence 1, measured provenance) rather than a reconstruction.
   */
  readonly verbatimSource: boolean;
}

/**
 * Conventional defaults applied on the reconstruction path when a domain
 * field is absent. Each carries the source rule and a confidence < 1, so an
 * engine input built from defaults is never presented as measured data.
 * These mirror the importer's inference rules (packages/dpe-xml-importer
 * INFERENCE_RULES) in reverse.
 */
export const ENGINE_INPUT_DEFAULTS = {
  CEILING_HEIGHT_2_5M: { source: 'default:engine-input-ceiling-height-2.5m', confidence: 0.4 },
  LEVEL_COUNT_1: { source: 'default:engine-input-level-count-1', confidence: 0.5 },
  MODELE_DPE_LOGEMENT_2021: { source: 'default:engine-input-modele-dpe-logement-2021', confidence: 0.5 },
  ZONE_CLIMATIQUE_H1: { source: 'default:engine-input-zone-climatique-h1', confidence: 0.3 },
  ALTITUDE_CLASSE_1: { source: 'default:engine-input-classe-altitude-1', confidence: 0.3 }
} as const;

interface Ctx {
  readonly root: Record<string, unknown>;
  readonly defaults: MappingDefault[];
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i] as string;
    if (typeof node[key] !== 'object' || node[key] === null) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1] as string] = value;
}

/**
 * Writes a Confidence-wrapped domain value at `path` in the engine input.
 * Inferred (confidence < 1) values are recorded in the defaults log with
 * their original source and confidence. When the field is absent, the given
 * conventional fallback is written and logged with the fallback's rule.
 */
function put(
  ctx: Ctx,
  path: string[],
  c: Confidence<unknown> | null,
  fallback?: { value: unknown; source: string; confidence: number }
): void {
  const logPath = path.join('/');
  if (c !== null) {
    setPath(ctx.root, path, c.value);
    if (!isMeasured(c)) {
      ctx.defaults.push({ path: logPath, value: c.value, source: c.source, confidence: c.confidence });
    }
    return;
  }
  if (fallback !== undefined) {
    setPath(ctx.root, path, fallback.value);
    ctx.defaults.push({
      path: logPath,
      value: fallback.value,
      source: fallback.source,
      confidence: fallback.confidence
    });
  }
}

function putRaw(ctx: Ctx, path: string[], value: unknown): void {
  setPath(ctx.root, path, value);
}

/**
 * Maps a {@link BuildingSimulationView} to the Open3CL engine input.
 *
 * Two paths (see docs/phases/P2-simulation-mapping.md):
 * 1. **Verbatim source** (all imported buildings): when the view carries the
 *    retained source DPE XML, the engine input is exactly that document —
 *    this is what makes the adapter reproducible byte-for-byte against a
 *    direct engine run on the original diagnostic (AC-P2-02).
 * 2. **Reconstruction** (edited buildings, P4+): a DPE JSON object is
 *    rebuilt field-wise from the domain model. Every value taken from an
 *    inferred (confidence < 1) field, and every conventional default applied
 *    for an absent field, is recorded in `defaults` with its source and
 *    confidence — the caller must log them, never pass them silently.
 *
 * @param view - read-only projection of the Building aggregate
 */
export function buildEngineInput(view: BuildingSimulationView): EngineInputMapping {
  if (view.sourceDpeXml !== null && view.sourceDpeXml.trim().length > 0) {
    return { input: { kind: 'xml', xml: view.sourceDpeXml }, defaults: [], verbatimSource: true };
  }
  const ctx: Ctx = { root: {}, defaults: [] };
  const d = ENGINE_INPUT_DEFAULTS;

  put(ctx, ['dpe', 'numero_dpe'], view.dpeNumber);
  put(ctx, ['dpe', 'statut'], view.status);
  put(ctx, ['dpe', 'administratif', 'enum_modele_dpe_id'], null, {
    value: '1',
    source: d.MODELE_DPE_LOGEMENT_2021.source,
    confidence: d.MODELE_DPE_LOGEMENT_2021.confidence
  });

  const cg = 'dpe/logement/caracteristique_generale';
  put(ctx, [...cg.split('/'), 'surface_habitable_logement'], view.livingAreaM2);
  put(ctx, [...cg.split('/'), 'surface_habitable_immeuble'], view.buildingLivingAreaM2);
  put(ctx, [...cg.split('/'), 'hsp'], view.ceilingHeightM, {
    value: 2.5,
    source: d.CEILING_HEIGHT_2_5M.source,
    confidence: d.CEILING_HEIGHT_2_5M.confidence
  });
  put(ctx, [...cg.split('/'), 'nombre_niveau_logement'], view.levelCount, {
    value: 1,
    source: d.LEVEL_COUNT_1.source,
    confidence: d.LEVEL_COUNT_1.confidence
  });
  put(ctx, [...cg.split('/'), 'annee_construction'], view.constructionYear);
  put(ctx, [...cg.split('/'), 'enum_periode_construction_id'], view.constructionPeriod);
  put(ctx, [...cg.split('/'), 'nombre_appartement'], view.apartmentCount);

  const meteo = 'dpe/logement/meteo';
  put(ctx, [...meteo.split('/'), 'enum_zone_climatique_id'], view.climateZone, {
    // The engine enum keys are numeric ids (fixtures: '1'..'8'; '1' = zone H1a).
    value: '1',
    source: d.ZONE_CLIMATIQUE_H1.source,
    confidence: d.ZONE_CLIMATIQUE_H1.confidence
  });
  put(ctx, [...meteo.split('/'), 'enum_classe_altitude_id'], view.altitudeClass, {
    value: '1',
    source: d.ALTITUDE_CLASSE_1.source,
    confidence: d.ALTITUDE_CLASSE_1.confidence
  });
  put(ctx, [...meteo.split('/'), 'altitude'], view.altitudeM);

  put(ctx, ['dpe', 'logement', 'enveloppe', 'inertie', 'enum_classe_inertie_id'], view.thermalInertiaClass);

  const env = 'dpe/logement/enveloppe';
  putRaw(
    ctx,
    [...env.split('/'), 'mur_collection', 'mur'],
    view.walls.map((w) => ({
      donnee_entree: {
        description: w.description?.value,
        surface_paroi_totale: w.areaM2?.value,
        enum_orientation_id: w.orientation?.value,
        enum_materiaux_structure_mur_id: w.wallType?.value,
        enum_type_adjacence_id: w.adjacencyType?.value
      },
      donnee_intermediaire: { umur: w.uValueWm2K?.value }
    }))
  );
  putRaw(
    ctx,
    [...env.split('/'), 'plancher_haut_collection', 'plancher_haut'],
    view.roofs.map((r) => ({
      donnee_entree: {
        description: r.description?.value,
        surface_paroi_opaque: r.areaM2?.value,
        enum_type_plancher_haut_id: r.roofType?.value,
        enum_type_adjacence_id: r.adjacencyType?.value
      },
      donnee_intermediaire: { uph: r.uValueWm2K?.value }
    }))
  );
  putRaw(
    ctx,
    [...env.split('/'), 'plancher_bas_collection', 'plancher_bas'],
    view.floors.map((f) => ({
      donnee_entree: {
        description: f.description?.value,
        surface_paroi_opaque: f.areaM2?.value,
        enum_type_plancher_bas_id: f.floorType?.value,
        enum_type_adjacence_id: f.adjacencyType?.value
      },
      donnee_intermediaire: { upb: f.uValueWm2K?.value }
    }))
  );
  putRaw(
    ctx,
    [...env.split('/'), 'baie_vitree_collection', 'baie_vitree'],
    view.windows.map((w) => ({
      donnee_entree: {
        description: w.description?.value,
        surface_totale_baie: w.areaM2?.value,
        nb_baie: w.count?.value,
        enum_orientation_id: w.orientation?.value,
        enum_type_vitrage_id: w.glazingType?.value,
        enum_type_materiaux_menuiserie_id: w.frameMaterial?.value
      },
      donnee_intermediaire: { uw: w.uValueWm2K?.value, sw: w.solarFactorSw?.value }
    }))
  );
  putRaw(
    ctx,
    [...env.split('/'), 'porte_collection', 'porte'],
    view.doors.map((door) => ({
      donnee_entree: {
        description: door.description?.value,
        surface_porte: door.areaM2?.value,
        nb_porte: door.count?.value,
        enum_type_porte_id: door.doorType?.value
      },
      donnee_intermediaire: { uporte: door.uValueWm2K?.value }
    }))
  );

  putRaw(
    ctx,
    ['dpe', 'logement', 'installation_chauffage_collection', 'installation_chauffage'],
    view.heatingSystems.map((h) => ({
      donnee_entree: {
        description: h.description?.value,
        enum_type_installation_id: h.installationType?.value,
        surface_chauffee: h.heatedAreaM2?.value
      }
    }))
  );
  putRaw(
    ctx,
    ['dpe', 'logement', 'ventilation_collection', 'ventilation'],
    view.ventilationSystems.map((v) => ({
      donnee_entree: {
        description: v.description?.value,
        enum_type_ventilation_id: v.ventilationType?.value,
        surface_ventile: v.ventilatedAreaM2?.value
      },
      donnee_intermediaire: { q4pa_conv: v.q4paConv?.value }
    }))
  );
  putRaw(
    ctx,
    ['dpe', 'logement', 'production_elec_enr', 'panneaux_pv_collection', 'panneaux_pv'],
    view.photovoltaicSystems.map((p) => ({
      surface_totale_capteurs: p.sensorAreaM2?.value,
      nombre_module: p.moduleCount?.value,
      enum_orientation_pv_id: p.orientation?.value,
      enum_inclinaison_pv_id: p.inclination?.value
    }))
  );

  // Inferred envelope/system values are logged with their confidence so the
  // engine input is never silently treated as measured.
  for (const [elements, base] of [
    [view.walls, `${env}/mur_collection/mur`],
    [view.roofs, `${env}/plancher_haut_collection/plancher_haut`],
    [view.floors, `${env}/plancher_bas_collection/plancher_bas`],
    [view.windows, `${env}/baie_vitree_collection/baie_vitree`],
    [view.doors, `${env}/porte_collection/porte`]
  ] as const) {
    elements.forEach((el, i) => {
      for (const [key, c] of Object.entries(el)) {
        if (c !== null && typeof c === 'object' && 'confidence' in (c as Confidence<unknown>)) {
          const conf = c as Confidence<unknown>;
          if (!isMeasured(conf)) {
            ctx.defaults.push({
              path: `${base}[${i + 1}]/${key}`,
              value: conf.value,
              source: conf.source,
              confidence: conf.confidence
            });
          }
        }
      }
    });
  }

  return { input: { kind: 'json', json: ctx.root }, defaults: ctx.defaults, verbatimSource: false };
}
