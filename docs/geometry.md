# Geometry & 3D Reconstruction (P3)

How a persisted `Building` (P1) becomes a deterministic 3D model: coordinate
system, inference rules catalog, mesh hash, API contract, and the heat-loss
overlay projection. Implementation: `packages/domain/src/geometry.ts` +
`reconstruction.ts` + `heat-loss.ts`, `packages/geometry` (buffer adapter),
`apps/api` (`GET /buildings/:id/geometry`), `apps/web` (R3F viewer).

## Coordinate system (TR-P3-06)

- **Unit:** meters.
- **Z-up:** X = east, Y = north, Z = up.
- **Origin:** the building footprint corner with the smallest X and Y, at the
  bottom of the ground floor (`z = 0`).
- Constant: `COORDINATE_SYSTEM` in `packages/domain/src/geometry.ts`
  (attached to every produced `Geometry`). Unit-tested in
  `packages/domain/test/geometry.test.ts` and `reconstruction.test.ts`
  (wall normals, roof/floor Z, bounds).

## Determinism (TR-P3-04)

- Element ids are **stable**: the domain entity ids (`wall-1`, `window-2`, …)
  or deterministic synthesized ids (`roof-synthesized-1`, …). P4 relies on them.
- All iteration is in stable (id-sorted) order; coordinates are rounded to 6
  decimals (`round6`); no clocks, no randomness.
- `Geometry.meshHash` = cyrb53 (pure-TS, engine-independent) over the canonical
  serialization of every element face + `inferenceRulesVersion`. Same building →
  same hash; tested in unit tests, in the API integration test (two calls →
  byte-identical response), and end-to-end in Playwright (rendered hash === API
  hash).

## Reconstruction model

The DPE gives **areas, U-values and orientations — never coordinates**. The
reconstruction is therefore a rectangular footprint (aspect ratio 4:3) with:

- one wall per DPE wall, placed on the side matching its orientation
  (3CL `enum_orientation_id` 1=N … 8=NW; diagonals map to their primary
  cardinal), `length = area / totalHeight`, clamped to the side; walls without
  orientation take the side with the most remaining capacity;
- **Class B (ADR-0005, `inferenceRulesVersion = 2.0.0`)**: walls stack per level
  from `levelCount` (one quad per level from `z = level × ceiling height`),
  with a horizontal floor slab at each intermediate level boundary;
- openings (windows/doors) are **real holes**: the host wall quad (same
  orientation, else the longest wall) is split into sub-faces around the
  opening rectangle (left / below sill / above lintel / right), and the
  opening itself is a **recessed frame set into the 0.2 m wall thickness**
  (glazing + 4 reveals) with its placement origin on the wall plane — no more
  floating panel at +0.05 m;
- roofs as a **pitched gable roof along the long footprint axis** (two sloped
  quads + two gable triangles per roof), ridge height inferred from
  `roofType`/description with a named default rule when absent, split along X
  proportionally to roof areas (synthesized from the footprint when absent);
- floors as horizontal slabs split along X proportionally to their areas
  (synthesized from the footprint when absent), plus the inter-level slabs;
- rooms as floor strips along X proportional to their areas on the ground
  level, with DOM labels at the strip center.

## Inference rules catalog (`inferenceRulesVersion = 2.0.0`)

2.0.0 = Class B (ADR-0005, issue #66): pitched roof, openings as holes with
recessed frames, multi-level stacking. Consumers branch on
`inferenceRulesVersion`; old 1.0.0 mesh hashes are not reinterpreted.

Every rule is named `inference:<rule>` and carried, with its confidence score,
in the `Confidence` of each produced element (`placement`, `areaM2`,
`orientation`). An element is marked `inferred` when its own placement
provenance has confidence < 1 or it was synthesized. Bump
`INFERENCE_RULES_VERSION` on any rule change (it is part of the mesh hash).

| Rule | Value | Confidence | Used when |
| --- | --- | --- | --- |
| `living-area-default-80` | 80 m² | 0.3 | no living area, no zone/room areas |
| `living-area-from-zones` | Σ zone areas | 0.7 | no living area, zones have areas |
| `living-area-from-rooms` | Σ room areas | 0.6 | no living area, only rooms have areas |
| `footprint-aspect-ratio-4-3` | width/depth = 4/3 | 0.5 | always (DPE has no shape); recorded via `inferenceRulesVersion`, not per element |
| `ceiling-height-default-2-5` | 2.5 m | 0.6 | `hsp` missing |
| `level-count-default-1` | 1 | 0.6 | level count missing |
| `wall-thickness-0-2` | 0.2 m | 0.5 | always (display constant) |
| `wall-orientation-by-capacity` | side with most remaining length | 0.4 | wall orientation missing |
| `wall-length-from-remaining-side` | remaining side / remaining walls | 0.4 | wall area missing |
| `wall-length-clamped-to-side` | clamp to side length | 0.5 | area/height exceeds the side |
| `slab-area-equal-share` | footprint area / slab count | 0.4 | roof/floor with missing area |
| `room-area-equal-share` | footprint area / room count | 0.4 | room with missing area |
| `opening-cursor-clamped-to-host-wall` | clamp cursor to host wall | 0.5 | openings would overflow the host wall corner |
| `opening-width-scaled-to-fit-host` | all opening widths on a host wall scaled down proportionally so they fit side by side | 0.5 | combined opening widths + gaps exceed the host wall length |
| `footprint-area-per-level` | footprint = living area / levelCount | (via levelCount provenance) | always — the living area is total over levels |
| `window-height-1-2` / `window-sill-0-9` | 1.2 m / 0.9 m | 0.5 | always (DPE has no opening dims) |
| `door-height-2-0` | 2.0 m | 0.5 | always |
| `opening-host-wall-by-orientation` / `-longest` | host wall choice | 0.6 / 0.4 | opening placement |
| `opening-orientation-from-host-wall` | host wall orientation | 0.6 | opening orientation missing |
| `roof-from-footprint` / `floor-from-footprint` | footprint slab | 0.5 | no `plancher_haut` / `plancher_bas` |
| `walls-from-perimeter` | synthesized full-length wall on a side with no DPE `mur` (4 walls when there are none) | 0.3 | envelope closure — a side without a `mur` gets an inferred wall |
| `room-from-footprint` | single room | 0.5 | no rooms |
| `ridge-height-from-roof-type` | 0.35 × short span (combles aménagés/rampant) or 0.30 × short span (toiture/chaume/bac acier) | 0.7 | Class B: `roofType`/description denotes a pitched roof |
| `ridge-height-default` | 0.25 × short span | 0.4 | Class B: no usable roof type → default gable ridge height |
| `opening-hole-subtraction` | wall quad split into sub-faces around the opening; recessed frame in the wall thickness | 0.5 | Class B: every window/door opening |
| `per-level-wall-stacking` | one wall quad per level from z = level × ceiling | 0.5 | Class B: `levelCount` > 1 |
| `inter-level-floor-slab` | horizontal slab at each intermediate level boundary (`floor-synthesized-N`) | 0.5 | Class B: `levelCount` > 1 |

Assumption (confidence: high for the *pipeline*, medium for the *shape*): a
single rectangular footprint is a display model, not a survey. Inferred elements
are always visually marked (orange + hatch) with a tooltip showing
`{ source, confidence }` — inferred data is never presented as measured.

## API contract

`GET /buildings/:id/geometry` → `{ buildingId, geometry: GeometryJson }`
(computed server-side on every request — pure and cheap, see the benchmark — so
the < 2 s budget and hash stability do not depend on client hardware).
404 on unknown id. `GeometryJson` is the plain-data shape of `Geometry`
(`geometryToJson` / `geometryFromJson` in the domain).

## Rendering (apps/web)

React Three Fiber + three.js. Buffers are merged by material class (envelope /
inferred-hatch / openings / rooms → ≤ 4 draw calls, TR-P3-02) via
`@hes/geometry` (pure) and `@hes/geometry/three` (`THREE.BufferGeometry`).
The domain geometry is Z-up while three.js is Y-up: `@hes/geometry/three`
converts the axes once at the rendering boundary (`(x, y, z) → (x, z, −y)` in
`toThreeBufferGeometry`), so the domain objects and the mesh hash are never
touched. Picking: raycast → `faceIndex * 3` → buffer group → stable element id → Zustand
store → MUI side panel (U-value, area, orientation, confidence). Room labels
and the hover tooltip are DOM overlays projected from the Canvas. No business
logic in components.

## Heat-loss overlay (FR-P3-04)

Read-only projection of a `SimulationResult` (P2) onto the geometry — P3 never
computes energy (ADR-0001): `projectHeatLoss` reads the engine-reported
category losses `logement.sortie.deperdition.{mur, plancher_bas,
plancher_haut, baie_vitree, porte}` (W/K) and distributes each category across
the elements of that kind proportionally to their area. Shares are normalized
to sum to exactly 100% (unit-tested with a mocked `SimulationResult`). The
overlay is **hidden while no `SimulationResult` exists** (P2 not merged yet);
the store seam (`setSimulation`) is wired to P2 by a small integration PR.
Colors: green (low share) → amber → red (high share).

## Performance

- Reconstruction (server, per request): p50/p95/max in
  [P3-geometry-benchmark-report.md](phases/P3-geometry-benchmark-report.md)
  — budget p95 < 2000 ms (AC-P3-01), enforced by the `benchmark:geometry` CI job.
- Rendering: merged draw calls as above; 60 fps target on mid-range GPUs for
  dwellings ≤ 300 m² (tens of elements).
