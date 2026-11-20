# P1 — DPE XML → Building Mapping (v1)

Mapping implemented by `packages/dpe-xml-importer` (pure core, fast-xml-parser,
no NestJS/ORM, never `@open3cl/engine`). Source of truth for the mapping is
the fixture corpus at `packages/open3cl-adapter/test/fixtures/` (15 real DPE
XML files, `modele_dpe_id=1`, `enum_version_id` ∈ {2, 2.1, 2.2, 2.3, 2.4}).

## Pipeline

1. **Size guard** — reject > 5 MB (`DpeFileTooLargeError`) before parsing.
2. **Well-formedness** — `XMLValidator.validate` (`InvalidDpeXmlError`).
3. **Hardened parse** — `XMLParser` with `processEntities: false`
   (XXE / billion-laughs safe), `ignoreAttributes: true`,
   `parseTagValue: false` (explicit numeric conversion in mappers),
   `removeNSPrefix: true`. Bounded (≤ 5 MB in memory), not streaming.
4. **Schema validation** — structural checks (root `dpe`, `numero_dpe`,
   `administratif` with model/version enums, `logement/caracteristique_generale`,
   nesting ≤ 64). Unknown optional elements are **not** errors; they are
   reported. Failures → `DpeSchemaValidationError` → HTTP 422.
5. **Mapping** — per-section mappers record parsed / inferred / missing fields
   and build the `Building` aggregate (`Building.createForImport`, emits
   `BuildingImported`). Unmapped elements are collected as unrecognized fields
   (aggregated by path with occurrence counts).

## Section mapping

| DPE XML path | Domain target | Notes |
| --- | --- | --- |
| `dpe/numero_dpe`, `dpe/statut` | `Building.dpeNumber`, `status` | measured |
| `administratif/geolocalisation/adresses/adresse_bien` | `address`, `banId`, `banCoordinates` (Lambert-93 x/y → PostGIS `geometry(Point, 2154)`) | `ban_x`/`ban_y` measured |
| `logement/caracteristique_generale/surface_habitable_logement` | `Building.livingAreaM2` | fallback: `surface_habitable_immeuble` (inferred, 0.8) |
| `.../hsp` | `ceilingHeightM` | missing → inferred 2.5 m (0.4, 3CL conventional default) |
| `.../nombre_niveau_logement` | `levelCount` | missing → inferred 1 (0.5) |
| `.../annee_construction`, `enum_periode_construction_id` | `constructionYear`, `constructionPeriod` | no inference rule; reported missing |
| `.../nombre_appartement`, `surface_habitable_immeuble` | `apartmentCount`, `buildingLivingAreaM2` | |
| `logement/meteo/*` | `climateZone`, `altitudeClass`, `altitudeM` | raw enum ids kept (no invented label tables) |
| `logement/enveloppe/inertie/enum_classe_inertie_id` | `thermalInertiaClass` | |
| `enveloppe/mur_collection/mur[]` | `Wall[]` | area = `surface_paroi_totale` (fallback `surface_paroi_opaque`), U = `donnee_intermediaire/umur`, orientation, wall/adjacency types |
| `enveloppe/plancher_haut_collection/plancher_haut[]` | `Roof[]` | area = `surface_paroi_opaque`, U = `uph` |
| `enveloppe/plancher_bas_collection/plancher_bas[]` | `Floor[]` | U = `upb` |
| `enveloppe/baie_vitree_collection/baie_vitree[]` | `Window[]` | area = `surface_totale_baie` (used as-is; `nb_baie` kept as `count`), U = `uw`, solar factor = `sw` |
| `enveloppe/porte_collection/porte[]` | `Door[]` | area = `surface_porte`, U = `uporte`, `nb_porte` → `count` |
| `installation_chauffage_collection/installation_chauffage[]` | `HeatingSystem[]` | `surface_chauffee` → heated area |
| `ventilation_collection/ventilation[]` | `VentilationSystem[]` | `surface_ventile`, `q4pa_conv` |
| `production_elec_enr/panneaux_pv_collection/panneaux_pv[]` | `PhotovoltaicSystem[]` | sensor area, module count, orientation, inclination |
| (absent in DPE) | one `Zone` (`zone-1`, area = living area) + one `ThermalZone` | zone/thermal-zone labels inferred (0.9); rooms are **not** in the DPE → reported missing |

Not mapped in v1 (reported as unrecognized, never fatal): `logement/sortie`,
`fiche_technique_collection`, `descriptif_*`, `justificatif_collection`,
`descriptif_travaux`, `dpe_immeuble`, `installation_ecs_collection`,
`climatisation_collection`, `pont_thermique_collection`, `ets_collection`,
per-element fields not listed above.

## Inference rules (versioned, all with confidence < 1)

| Rule (`inference:<rule>`) | Value | Confidence |
| --- | --- | --- |
| `living-area-from-building-area` | `surface_habitable_immeuble` | 0.8 |
| `default-ceiling-height-2.5m` | 2.5 m | 0.4 |
| `default-level-count-1` | 1 | 0.5 |
| `default-count-1` | 1 (nb_baie / nb_porte) | 0.5 |
| `single-zone-from-logement` | zone / thermal-zone labels | 0.9 |
| `thermal-zone-heated-area-from-living-area` | living area | 0.7 (only when no `surface_chauffee`) |
| `default-element-label` | positional label (`mur 1`, …) | 0.3 |

Every inferred value is stored as `Confidence<T>` (`value`, `source`,
`confidence`, `importDate`) and mirrored in `report.inferredFields`.

## Assumptions (confidence noted)

- `surface_totale_baie` is used as the window area as-is; `nb_baie` is kept
  separately as `count` (the DPE does not state whether the surface is per
  bay or total — assumption, medium confidence).
- Raw `enum_*_id` values are kept as strings; no label tables are invented.
- The owner-provided ADEME DPE XML + DPE report join the corpus after privacy
  review; until then the P0/engine-clone corpus is used. No fixture data is
  invented.
