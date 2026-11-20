# P2 — Building → Open3CL Engine Input Mapping

Status: Implemented (Phase P2). Owner package: `packages/open3cl-adapter`
(`src/map-building-to-engine-input.ts`) — the only package allowed to import
`@open3cl/engine` (ADR-0001, ESLint-enforced).

## Why two mapping paths

The P1 `Building` aggregate is an **intentionally lossy** projection of the
DPE XML: it models the envelope, systems and administrative data, but does
not (yet) model e.g. the ECS installation, thermal bridges
(`pont_thermique`), or the DPE model/version enums — all of which the engine
uses in its 3CL computation (`11_ecs.js`, `3.4_pont_thermique.js`, …).
Therefore a field-wise reconstruction from the aggregate alone **cannot**
reproduce the engine output on the original diagnostic, and AC-P2-02
(100% semantic identity with a direct engine run, including the raw output)
would be impossible.

P2 consequently retains the **verbatim source DPE XML** on the aggregate
(`Building.sourceDpeXml`, persisted inside `buildings.data` JSONB — no schema
change to v1 tables was needed) and maps the engine input in two ways:

| Path | When | Engine input | Contract |
| --- | --- | --- | --- |
| 1. Verbatim source | `sourceDpeXml` present (every imported building) | the retained XML, unchanged | `calcul_3cl_xml` output is **identical** to a direct engine run on the original file — proven by `packages/open3cl-adapter/test/building-vs-engine.contract.test.ts` on 15/15 fixtures |
| 2. Reconstruction | `sourceDpeXml` absent (future edited buildings, P4+) | a DPE JSON object rebuilt field-wise (`calcul_3cl`) | every inferred value and every default is recorded in `defaults` with `path / value / source / confidence` and logged by the adapter — never silent |

The adapter never mutates the aggregate: it works on
`BuildingSimulationView` (`packages/domain/src/building-simulation-view.ts`),
a frozen read-only projection in which all `Confidence<T>` metadata flows
through unchanged.

## Field mapping (reconstruction path)

Domain (`BuildingSimulationView`) → DPE JSON path:

| Domain field | DPE JSON path |
| --- | --- |
| `dpeNumber` | `dpe/numero_dpe` |
| `status` | `dpe/statut` |
| — (absent) | `dpe/administratif/enum_modele_dpe_id` → default `1` |
| `livingAreaM2` | `dpe/logement/caracteristique_generale/surface_habitable_logement` |
| `buildingLivingAreaM2` | `…/surface_habitable_immeuble` |
| `ceilingHeightM` | `…/hsp` (default 2.5) |
| `levelCount` | `…/nombre_niveau_logement` (default 1) |
| `constructionYear` | `…/annee_construction` |
| `constructionPeriod` | `…/enum_periode_construction_id` |
| `apartmentCount` | `…/nombre_appartement` |
| `climateZone` | `dpe/logement/meteo/enum_zone_climatique_id` (default `'1'` = zone H1a; the engine enum keys are numeric ids) |
| `altitudeClass` | `…/enum_classe_altitude_id` (default `1`) |
| `altitudeM` | `…/altitude` |
| `thermalInertiaClass` | `dpe/logement/enveloppe/inertie/enum_classe_inertie_id` |
| `walls[]` | `…/mur_collection/mur[]` (`donnee_entree`: description, surface_paroi_totale, enum_orientation_id, enum_materiaux_structure_mur_id, enum_type_adjacence_id; `donnee_intermediaire`: umur) |
| `roofs[]` | `…/plancher_haut_collection/plancher_haut[]` (uph) |
| `floors[]` | `…/plancher_bas_collection/plancher_bas[]` (upb) |
| `windows[]` | `…/baie_vitree_collection/baie_vitree[]` (surface_totale_baie, nb_baie, uw, sw, vitrage, menuiserie) |
| `doors[]` | `…/porte_collection/porte[]` (surface_porte, nb_porte, uporte, enum_type_porte_id) |
| `heatingSystems[]` | `…/installation_chauffage_collection/installation_chauffage[]` |
| `ventilationSystems[]` | `…/ventilation_collection/ventilation[]` (incl. q4pa_conv) |
| `photovoltaicSystems[]` | `…/production_elec_enr/panneaux_pv_collection/panneaux_pv[]` |

## Defaults and confidence (TR-P2-03)

Every default applied on the reconstruction path is logged by the adapter
(`Open3clAdapter` logger, one line per default: path, value, source,
confidence) and returned in `EngineInputMapping.defaults`:

| Default | Value | Source rule | Confidence |
| --- | --- | --- | --- |
| `hsp` when absent | 2.5 m | `default:engine-input-ceiling-height-2.5m` (mirrors importer rule `default-ceiling-height-2.5m`) | 0.4 |
| `nombre_niveau_logement` when absent | 1 | `default:engine-input-level-count-1` | 0.5 |
| `enum_modele_dpe_id` when absent | `1` (logement 2021) | `default:engine-input-modele-dpe-logement-2021` | 0.5 |
| `enum_zone_climatique_id` when absent | `'1'` (zone H1a) | `default:engine-input-zone-climatique-h1` | 0.3 |
| `enum_classe_altitude_id` when absent | `1` | `default:engine-input-classe-altitude-1` | 0.3 |

Additionally, any domain field whose `Confidence.confidence < 1` (inferred at
import) is logged with its original `inference:<rule>` source and score when
it enters the engine input. Inferred data is never presented as measured.

Sections the domain v1 does not model (ECS, thermal bridges, …) are **not**
invented on the reconstruction path: they are simply absent from the
reconstructed input and the engine applies its own behavior (or rejects the
input with a typed error, mapped to HTTP 500/422). When P4 editing lands, the
reconstruction path becomes the primary one and this table must be reviewed
per engine upgrade (same discipline as the contract suite).

## Result mapping (unchanged from P0)

`mapEngineResult`: `consumptionKwh ← logement.sortie.ep_conso.ep_conso_5_usages`,
`emissionsKg ← logement.sortie.emission_ges.emission_ges_5_usages`,
labels ← `get_classe_ges_dpe`, `rawEngineOutput` kept verbatim. The per-m²
figures shown in the UI (`ep_conso_5_usages_m2`, `emission_ges_5_usages_m2`)
are read from the raw output at the API presentation layer.

## Persistence

- `buildings.data` JSONB gains `sourceDpeXml` (verbatim source; provenance,
  not an inferred value, so no Confidence wrapper applies to it).
- Schema v2 (`infrastructure/postgres/migrations/0002_simulations.sql`):
  `simulations` (UNIQUE `(building_id, input_hash)` = result cache) and
  `simulation_jobs` (partial unique index = at most one in-flight job per
  input hash → HTTP 409).
- Cache key: sha256 over the canonical (key-sorted) JSON of `BuildingJson`
  (`computeBuildingInputHash`, domain) — any building change invalidates the
  cache automatically (TR-P2-05).

## Assumptions

- Owner-provided ADEME files still pending privacy review; corpus = the 15
  checked-in P0/P1 fixtures. No fixture data was invented. Frozen expected
  `Building` snapshots live in
  `packages/dpe-xml-importer/test/fixtures/snapshots/`.
- Retaining the raw DPE XML in the user's own database is consistent with the
  data already stored (address, BAN id, coordinates); it is required for
  regulatory reproducibility of the simulation (audit) and for AC-P2-02.
