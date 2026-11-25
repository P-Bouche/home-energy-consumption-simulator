import { xmlParser } from '@open3cl/engine/utils.js';
import { isMeasured, SimulationMappingError, USER_SOURCE, type BuildingSimulationView, type Confidence } from '@hes/domain';

/**
 * Engine input produced by {@link buildEngineInput}: either the verbatim
 * retained DPE XML document, the retained document parsed with the user edits
 * overlaid (P4/P5), or a DPE JSON object reconstructed field-wise from the
 * domain view (fallback when no source document is retained).
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
  /**
   * True when the engine input is the retained source document parsed to JS
   * with the user-supplied fields (source `user`) overlaid onto it (P4
   * editor edits / P5 scenario forks). The rest of the source document is
   * kept verbatim, so nothing unmodelled is invented.
   */
  readonly editedSource: boolean;
}

/**
 * @returns true when any Confidence-wrapped field of the view carries the
 * user source (a P4 edit or a P5 scenario command was applied to the building)
 */
export function hasUserEdits(view: BuildingSimulationView): boolean {
  return containsUserSource(view);
}

/**
 * Element collections whose fields {@link overlayUserEdits} knows how to
 * patch in the engine input. A user-sourced value anywhere else (a future
 * building-level command, a zone/room field, …) would take the edited-source
 * path but be silently dropped by the overlay.
 */
const OVERLAY_COVERED_COLLECTIONS = new Set([
  'walls',
  'roofs',
  'floors',
  'windows',
  'doors',
  'heatingSystems',
  'ventilationSystems'
]);

function collectUserFieldPaths(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectUserFieldPaths(item, `${path}/${i}`, out));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (rec['source'] === USER_SOURCE && typeof rec['confidence'] === 'number') {
      out.push(path);
      return;
    }
    for (const [key, childValue] of Object.entries(rec)) {
      collectUserFieldPaths(childValue, `${path}/${key}`, out);
    }
  }
}

/**
 * Fails loudly when the view carries a user-sourced field the overlay does NOT
 * cover (i.e. not `<covered collection>/<index>/<field>`). Without this check
 * a future command vocabulary entry (e.g. a building-level edit) would make
 * the building take the edited-source path while its edit is silently dropped
 * from the engine input.
 *
 * @throws SimulationMappingError listing every uncovered user-sourced path
 */
export function assertOverlayCoversUserEdits(view: BuildingSimulationView): void {
  const paths: string[] = [];
  collectUserFieldPaths(view, '', paths);
  const uncovered = paths.filter((p) => {
    const match = /^\/([^/]+)\/\d+\/[^/]+$/.exec(p);
    return match === null || !OVERLAY_COVERED_COLLECTIONS.has(match[1] as string);
  });
  if (uncovered.length > 0) {
    throw new SimulationMappingError(
      `user-sourced field(s) not covered by the engine overlay, refusing to simulate a state whose edits would be silently dropped: ${uncovered.join(', ')}`
    );
  }
}

function containsUserSource(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsUserSource);
  }
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (rec['source'] === USER_SOURCE && typeof rec['confidence'] === 'number') {
      return true;
    }
    return Object.values(rec).some(containsUserSource);
  }
  return false;
}

interface OverlayCtx {
  readonly dpe: Record<string, unknown>;
  readonly defaults: MappingDefault[];
}

function child(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = obj[key];
  if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  obj[key] = created;
  return created;
}

function collection(dpe: Record<string, unknown>, path: string[]): Record<string, unknown>[] {
  let node: Record<string, unknown> = dpe;
  for (let i = 0; i < path.length - 1; i += 1) {
    node = child(node, path[i] as string);
  }
  const last = path[path.length - 1] as string;
  const existing = node[last];
  if (Array.isArray(existing)) {
    return existing as Record<string, unknown>[];
  }
  const created: Record<string, unknown>[] = [];
  node[last] = created;
  return created;
}

function userValue(c: Confidence<unknown> | null): unknown {
  return c === null ? undefined : c.value;
}

function isUser(c: Confidence<unknown> | null): c is Confidence<unknown> {
  return c !== null && c.source === USER_SOURCE;
}

function log(ctx: OverlayCtx, path: string, value: unknown): void {
  ctx.defaults.push({ path, value, source: USER_SOURCE, confidence: 1 });
}

/**
 * Index of a domain element id (`wall-3` → 2): the importer assigns
 * `<kind>-<i+1>` ids in document order, so the index addresses the matching
 * entry of the source document's collection.
 */
function elementIndex(id: string, kind: string): number | null {
  const match = new RegExp(`^${kind}-(\\d+)$`).exec(id);
  if (match === null) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function overlayElements<T extends { id: string }>(
  ctx: OverlayCtx,
  collectionPath: string[],
  elements: readonly T[],
  kind: string,
  apply: (entry: Record<string, unknown>, element: T, ctx: OverlayCtx) => void
): void {
  const items = collection(ctx.dpe, collectionPath);
  for (const element of elements) {
    const index = elementIndex(element.id, kind);
    if (index === null || index >= items.length) {
      // Never silent: a user-edited element that cannot be matched to a source
      // document entry would be silently dropped from the engine input.
      if (containsUserSource(element)) {
        ctx.defaults.push({
          path: `${collectionPath.join('/')}/${element.id}`,
          value: 'NO MATCHING ENTRY IN THE RETAINED SOURCE DOCUMENT — user edits on this element were NOT overlaid',
          source: USER_SOURCE,
          confidence: 1
        });
      }
      continue;
    }
    apply(items[index] as Record<string, unknown>, element, ctx);
  }
}

/**
 * Overlays every user-supplied (source `user`) field of the view onto the
 * parsed source DPE document. Engine patch points (verified against engine
 * 1.11.6): a U-value change sets the `*_saisi` input field AND switches the
 * saisie method enum so the engine actually uses the entered value (e.g.
 * `enum_methode_saisie_u_id = '9'` + `umur_saisi` for a wall), plus the
 * `donnee_intermediaire` value for audit. Detection is vocabulary-agnostic:
 * it keys off `Confidence.source === 'user'`, which P4 stamps on every edit.
 *
 * @returns the mapping-default log of every overlaid user value
 */
export function overlayUserEdits(dpe: Record<string, unknown>, view: BuildingSimulationView): MappingDefault[] {
  const ctx: OverlayCtx = { dpe, defaults: [] };
  const env = ['logement', 'enveloppe'];

  overlayElements(ctx, [...env, 'mur_collection', 'mur'], view.walls, 'wall', (mur, wall) => {
    const de = child(mur, 'donnee_entree');
    const di = child(mur, 'donnee_intermediaire');
    if (isUser(wall.uValueWm2K)) {
      const v = userValue(wall.uValueWm2K);
      de['enum_methode_saisie_u_id'] = '9';
      de['umur_saisi'] = v;
      di['umur'] = v;
      log(ctx, 'mur/donnee_entree/umur_saisi', v);
    }
    if (isUser(wall.areaM2)) { de['surface_paroi_totale'] = userValue(wall.areaM2); log(ctx, 'mur/donnee_entree/surface_paroi_totale', userValue(wall.areaM2)); }
    if (isUser(wall.description)) { de['description'] = userValue(wall.description); log(ctx, 'mur/donnee_entree/description', userValue(wall.description)); }
    if (isUser(wall.orientation)) { de['enum_orientation_id'] = userValue(wall.orientation); log(ctx, 'mur/donnee_entree/enum_orientation_id', userValue(wall.orientation)); }
    if (isUser(wall.wallType)) { de['enum_materiaux_structure_mur_id'] = userValue(wall.wallType); log(ctx, 'mur/donnee_entree/enum_materiaux_structure_mur_id', userValue(wall.wallType)); }
    if (isUser(wall.adjacencyType)) { de['enum_type_adjacence_id'] = userValue(wall.adjacencyType); log(ctx, 'mur/donnee_entree/enum_type_adjacence_id', userValue(wall.adjacencyType)); }
  });

  overlayElements(ctx, [...env, 'plancher_haut_collection', 'plancher_haut'], view.roofs, 'roof', (item, roof) => {
    const de = child(item, 'donnee_entree');
    const di = child(item, 'donnee_intermediaire');
    if (isUser(roof.uValueWm2K)) {
      const v = userValue(roof.uValueWm2K);
      de['enum_methode_saisie_u_id'] = '9';
      de['uph_saisi'] = v;
      di['uph'] = v;
      log(ctx, 'plancher_haut/donnee_entree/uph_saisi', v);
    }
    if (isUser(roof.areaM2)) { de['surface_paroi_opaque'] = userValue(roof.areaM2); log(ctx, 'plancher_haut/donnee_entree/surface_paroi_opaque', userValue(roof.areaM2)); }
    if (isUser(roof.description)) { de['description'] = userValue(roof.description); log(ctx, 'plancher_haut/donnee_entree/description', userValue(roof.description)); }
    if (isUser(roof.roofType)) { de['enum_type_plancher_haut_id'] = userValue(roof.roofType); log(ctx, 'plancher_haut/donnee_entree/enum_type_plancher_haut_id', userValue(roof.roofType)); }
    if (isUser(roof.adjacencyType)) { de['enum_type_adjacence_id'] = userValue(roof.adjacencyType); log(ctx, 'plancher_haut/donnee_entree/enum_type_adjacence_id', userValue(roof.adjacencyType)); }
  });

  overlayElements(ctx, [...env, 'plancher_bas_collection', 'plancher_bas'], view.floors, 'floor', (item, floor) => {
    const de = child(item, 'donnee_entree');
    const di = child(item, 'donnee_intermediaire');
    if (isUser(floor.uValueWm2K)) {
      const v = userValue(floor.uValueWm2K);
      de['enum_methode_saisie_u_id'] = '9';
      de['upb_saisi'] = v;
      di['upb'] = v;
      log(ctx, 'plancher_bas/donnee_entree/upb_saisi', v);
    }
    if (isUser(floor.areaM2)) { de['surface_paroi_opaque'] = userValue(floor.areaM2); log(ctx, 'plancher_bas/donnee_entree/surface_paroi_opaque', userValue(floor.areaM2)); }
    if (isUser(floor.description)) { de['description'] = userValue(floor.description); log(ctx, 'plancher_bas/donnee_entree/description', userValue(floor.description)); }
    if (isUser(floor.floorType)) { de['enum_type_plancher_bas_id'] = userValue(floor.floorType); log(ctx, 'plancher_bas/donnee_entree/enum_type_plancher_bas_id', userValue(floor.floorType)); }
    if (isUser(floor.adjacencyType)) { de['enum_type_adjacence_id'] = userValue(floor.adjacencyType); log(ctx, 'plancher_bas/donnee_entree/enum_type_adjacence_id', userValue(floor.adjacencyType)); }
  });

  overlayElements(ctx, [...env, 'baie_vitree_collection', 'baie_vitree'], view.windows, 'window', (item, window) => {
    const de = child(item, 'donnee_entree');
    const di = child(item, 'donnee_intermediaire');
    if (isUser(window.uValueWm2K)) {
      const v = userValue(window.uValueWm2K);
      de['uw_saisi'] = v;
      di['uw'] = v;
      log(ctx, 'baie_vitree/donnee_entree/uw_saisi', v);
    }
    if (isUser(window.areaM2)) { de['surface_totale_baie'] = userValue(window.areaM2); log(ctx, 'baie_vitree/donnee_entree/surface_totale_baie', userValue(window.areaM2)); }
    if (isUser(window.count)) { de['nb_baie'] = userValue(window.count); log(ctx, 'baie_vitree/donnee_entree/nb_baie', userValue(window.count)); }
    if (isUser(window.description)) { de['description'] = userValue(window.description); log(ctx, 'baie_vitree/donnee_entree/description', userValue(window.description)); }
    if (isUser(window.orientation)) { de['enum_orientation_id'] = userValue(window.orientation); log(ctx, 'baie_vitree/donnee_entree/enum_orientation_id', userValue(window.orientation)); }
    if (isUser(window.glazingType)) { de['enum_type_vitrage_id'] = userValue(window.glazingType); log(ctx, 'baie_vitree/donnee_entree/enum_type_vitrage_id', userValue(window.glazingType)); }
    if (isUser(window.frameMaterial)) { de['enum_type_materiaux_menuiserie_id'] = userValue(window.frameMaterial); log(ctx, 'baie_vitree/donnee_entree/enum_type_materiaux_menuiserie_id', userValue(window.frameMaterial)); }
    if (isUser(window.solarFactorSw)) { di['sw'] = userValue(window.solarFactorSw); log(ctx, 'baie_vitree/donnee_intermediaire/sw', userValue(window.solarFactorSw)); }
  });

  overlayElements(ctx, [...env, 'porte_collection', 'porte'], view.doors, 'door', (item, door) => {
    const de = child(item, 'donnee_entree');
    const di = child(item, 'donnee_intermediaire');
    if (isUser(door.uValueWm2K)) {
      const v = userValue(door.uValueWm2K);
      de['enum_methode_saisie_uporte_id'] = '2';
      de['uporte_saisi'] = v;
      di['uporte'] = v;
      log(ctx, 'porte/donnee_entree/uporte_saisi', v);
    }
    if (isUser(door.areaM2)) { de['surface_porte'] = userValue(door.areaM2); log(ctx, 'porte/donnee_entree/surface_porte', userValue(door.areaM2)); }
    if (isUser(door.count)) { de['nb_porte'] = userValue(door.count); log(ctx, 'porte/donnee_entree/nb_porte', userValue(door.count)); }
    if (isUser(door.description)) { de['description'] = userValue(door.description); log(ctx, 'porte/donnee_entree/description', userValue(door.description)); }
    if (isUser(door.doorType)) { de['enum_type_porte_id'] = userValue(door.doorType); log(ctx, 'porte/donnee_entree/enum_type_porte_id', userValue(door.doorType)); }
  });

  overlayElements(ctx, ['logement', 'installation_chauffage_collection', 'installation_chauffage'], view.heatingSystems, 'heating', (item, system) => {
    const de = child(item, 'donnee_entree');
    if (isUser(system.installationType)) { de['enum_type_installation_id'] = userValue(system.installationType); log(ctx, 'installation_chauffage/donnee_entree/enum_type_installation_id', userValue(system.installationType)); }
    if (isUser(system.description)) { de['description'] = userValue(system.description); log(ctx, 'installation_chauffage/donnee_entree/description', userValue(system.description)); }
    if (isUser(system.heatedAreaM2)) { de['surface_chauffee'] = userValue(system.heatedAreaM2); log(ctx, 'installation_chauffage/donnee_entree/surface_chauffee', userValue(system.heatedAreaM2)); }
    // ADR-0004: generator type drives the engine result (9_generateur_ch.js) —
    // patch the first generateur_chauffage entry, position-pinned per ADR-0003.
    if (isUser(system.generatorType)) {
      const genDe = child(child(child(item, 'generateur_chauffage_collection'), 'generateur_chauffage'), 'donnee_entree');
      genDe['enum_type_generateur_ch_id'] = userValue(system.generatorType);
      log(ctx, 'installation_chauffage/generateur_chauffage_collection/generateur_chauffage/donnee_entree/enum_type_generateur_ch_id', userValue(system.generatorType));
    }
  });

  overlayElements(ctx, ['logement', 'ventilation_collection', 'ventilation'], view.ventilationSystems, 'ventilation', (item, system) => {
    const de = child(item, 'donnee_entree');
    const di = child(item, 'donnee_intermediaire');
    if (isUser(system.ventilationType)) { de['enum_type_ventilation_id'] = userValue(system.ventilationType); log(ctx, 'ventilation/donnee_entree/enum_type_ventilation_id', userValue(system.ventilationType)); }
    if (isUser(system.description)) { de['description'] = userValue(system.description); log(ctx, 'ventilation/donnee_entree/description', userValue(system.description)); }
    if (isUser(system.ventilatedAreaM2)) { de['surface_ventile'] = userValue(system.ventilatedAreaM2); log(ctx, 'ventilation/donnee_entree/surface_ventile', userValue(system.ventilatedAreaM2)); }
    if (isUser(system.q4paConv)) { di['q4pa_conv'] = userValue(system.q4paConv); log(ctx, 'ventilation/donnee_intermediaire/q4pa_conv', userValue(system.q4paConv)); }
  });

  return ctx.defaults;
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
 * Three paths (see docs/phases/P2-simulation-mapping.md):
 * 1. **Verbatim source** (imported buildings without user edits): when the
 *    view carries the retained source DPE XML and no field is user-supplied,
 *    the engine input is exactly that document — this is what makes the
 *    adapter reproducible byte-for-byte against a direct engine run on the
 *    original diagnostic (AC-P2-02).
 * 1b. **Source + user-edit overlay** (P4 edits / P5 scenario forks): the
 *    retained source document is parsed with the engine's own `xmlParser`
 *    and ONLY the fields whose `Confidence.source === 'user'` are overlaid
 *    at the engine patch points (`umur_saisi` + `enum_methode_saisie_u_id =
 *    '9'`, …). The rest of the document stays verbatim; every overlay is
 *    logged in `defaults` with source `user` and confidence 1.
 * 2. **Reconstruction** (buildings without a retained source document, P4+):
 *    a DPE JSON object is rebuilt field-wise from the domain model. Every
 *    value taken from an inferred (confidence < 1) field, and every
 *    conventional default applied for an absent field, is recorded in
 *    `defaults` with its source and confidence — the caller must log them,
 *    never pass them silently.
 *
 * @param view - read-only projection of the Building aggregate
 */
export function buildEngineInput(view: BuildingSimulationView): EngineInputMapping {
  if (view.sourceDpeXml !== null && view.sourceDpeXml.trim().length > 0) {
    // Path 1: verbatim source (imported buildings without user edits) —
    // byte-for-byte the direct engine run (AC-P2-02).
    if (!hasUserEdits(view)) {
      return { input: { kind: 'xml', xml: view.sourceDpeXml }, defaults: [], verbatimSource: true, editedSource: false };
    }
    // Path 1b (P4/P5): the retained source document parsed exactly like
    // calcul_3cl_xml does, with the user-supplied fields overlaid onto it.
    // Nothing unmodelled is invented: the rest of the document stays verbatim.
    // Fail loudly when a user edit targets a field the overlay does not cover.
    assertOverlayCoversUserEdits(view);
    const parsed = xmlParser.parse(view.sourceDpeXml) as Record<string, unknown>;
    const dpe = parsed['dpe'];
    if (typeof dpe !== 'object' || dpe === null || Array.isArray(dpe)) {
      throw new SimulationMappingError('the retained source DPE XML did not parse to a dpe object');
    }
    const dpeObj = dpe as Record<string, unknown>;
    const defaults = overlayUserEdits(dpeObj, view);
    return { input: { kind: 'json', json: dpeObj }, defaults, verbatimSource: false, editedSource: true };
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

  return { input: { kind: 'json', json: ctx.root }, defaults: ctx.defaults, verbatimSource: false, editedSource: false };
}
