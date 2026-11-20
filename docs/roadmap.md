# Roadmap — Home Energy Consumption Simulator

Phases are sequential but overlapping where noted. Each phase lists objective, deliverables, dependencies, risks, and success criteria.

Detailed phase documentation (requirements, architecture, test plans, risks, exit criteria, definition of done): [P0](phases/P0-open3cl-feasibility.md) · [P1](phases/P1-dpe-import.md) · [P2](phases/P2-energy-simulation.md) · [P3](phases/P3-3d-reconstruction.md) · [P4](phases/P4-building-editor.md) · [P5](phases/P5-scenario-management.md) · [P6](phases/P6-pdf-import.md) · [P7](phases/P7-ifc-integration.md) · [P8](phases/P8-ai-renovation-advisor.md) · [P9](phases/P9-iot-digital-twin.md) · [P10](phases/P10-photogrammetry.md)

## P0 — Open3CL Feasibility

- **Objective:** prove end-to-end that the Open3CL engine can be embedded and driven from this platform.
- **Deliverables:** integration spike, benchmark report, `docs/decisions/ADR-0001-open3cl-as-core-engine.md`, sample DPE fixtures.
- **Dependencies:** availability of the Open3CL engine package and its test corpus.
- **Risks:** engine API mismatch; performance below budget; licensing issues.
- **Success criteria:** one real DPE simulated in < 3 s with plausible consumption/emission labels; ADR accepted.

## P1 — DPE XML Import

- **Objective:** import a French DPE XML file into the domain `Building` model.
- **Deliverables:** `packages/dpe-xml-importer`, API endpoint `POST /imports/dpe`, confidence metadata (`value/source/confidence/importDate`), unit + fixture tests.
- **Dependencies:** P0; domain core scaffolding.
- **Risks:** DPE schema variants (different years/versions); missing fields; malformed XML.
- **Success criteria:** import < 1 s; ≥ 80% coverage; every inferred value carries confidence metadata; import report lists gaps.

## P2 — Energy Simulation

- **Objective:** run Open3CL on an imported building and persist the result.
- **Deliverables:** `packages/open3cl-adapter`, `SimulationPort`, `SimulationResult` entity, `RunSimulationUseCase`, contract tests against engine fixtures.
- **Dependencies:** P0, P1.
- **Risks:** domain→engine mapping errors; engine regressions; latency.
- **Success criteria:** simulation < 3 s; results match engine output exactly; contract tests green on all fixtures.

## P3 — 3D Reconstruction

- **Objective:** reconstruct and render the building in 3D from domain data.
- **Deliverables:** geometry builder, React Three Fiber viewer, heat-loss visualization, reconstruction from incomplete data with confidence display.
- **Dependencies:** P1.
- **Risks:** incomplete geometry in DPE files; rendering performance on large buildings.
- **Success criteria:** reconstruction < 2 s; 3D view renders walls/roof/floors/openings; inferred elements visually marked.

## P4 — Building Editor

- **Objective:** let users edit the building (walls, windows, systems) and persist changes.
- **Deliverables:** editing use cases + validation, UI editor, audit trail of changes, round-trip edit → simulate.
- **Dependencies:** P1, P3.
- **Risks:** invalid states (e.g., inconsistent thermal zone); data loss on conflicting edits.
- **Success criteria:** user edits persist and re-simulate correctly; every user-supplied value marked with source = "user" and high confidence.

## P5 — Scenario Management

- **Objective:** model renovation scenarios and compare them.
- **Deliverables:** `Scenario` entity, scenario CRUD, comparison use case, comparison UI (consumption, emissions, cost, DPE label per scenario).
- **Dependencies:** P2, P4.
- **Risks:** combinatorial explosion of scenarios; misleading comparisons.
- **Success criteria:** scenario comparison < 1 s; side-by-side results with clear deltas vs baseline.

## P6 — PDF Import

- **Objective:** extract geometry from PDF floorplans.
- **Deliverables:** `packages/pdf-floorplan-importer`, vector extraction + raster/OCR fallback, scale calibration UI.
- **Dependencies:** P1.
- **Risks:** rasterized PDFs; missing scale; poor OCR quality.
- **Success criteria:** usable room/wall geometry extracted from common residential plans; extraction confidence reported.

## P7 — IFC Integration

- **Objective:** import IFC/OpenBIM models into the domain model.
- **Deliverables:** `packages/ifc-importer`, IFC → domain mapping (walls, slabs, openings, spaces), validation report.
- **Dependencies:** P1.
- **Risks:** IFC schema complexity and vendor variance; large files.
- **Success criteria:** a sample IFC building imports with walls/openings/spaces mapped; round-trip to Open3CL simulation works.

## P8 — AI Advisor

- **Objective:** recommend renovation actions grounded in simulation deltas.
- **Deliverables:** recommendation engine on top of scenario simulations, ranked actions with cost/effort estimates, confidence labels, UI panel.
- **Dependencies:** P2, P5.
- **Risks:** hallucinated or ungrounded advice; unreliable cost data.
- **Success criteria:** every recommendation traces back to a simulation delta and carries a confidence score; no recommendation without a computed impact.

## P9 — IoT Digital Twin

- **Objective:** connect real consumption telemetry and compare it with simulation.
- **Deliverables:** telemetry ingestion pipeline, `Measurement` model, live dashboard (simulated vs measured), deviation alerts.
- **Dependencies:** P2.
- **Risks:** data privacy and consent; heterogeneous device protocols; ingestion volume.
- **Success criteria:** pilot device streams data; dashboard shows simulated vs measured with deviation metrics; GDPR-compliant consent flow.

## P10 — Photogrammetry / LiDAR

- **Objective:** import 3D captures (photogrammetry, LiDAR scans) to enrich or create building models.
- **Deliverables:** point-cloud/mesh ingestion, mesh → domain geometry conversion, alignment with existing model, confidence display.
- **Dependencies:** P3.
- **Risks:** mesh quality and noise; file sizes; alignment drift.
- **Success criteria:** a LiDAR/photogrammetry capture of a room converts into editable walls/openings and re-simulates via Open3CL.


## Parallel Execution Plan (post-P1)

After P1, phases run in parallel tracks. Each phase = one branch + one PR + green CI; merge order is flexible as long as the stated dependencies hold. Shared contracts (`SimulationPort.simulateBuilding`, scenario command tags, `Building.mergeGeometry`, geometry/CRS conventions) are frozen in small contract PRs before the parallel work starts, so phase branches only touch their own packages and conflicts stay minimal.

| Track | Branch | Depends on | Runs in parallel with |
| --- | --- | --- | --- |
| P2 — Energy Simulation (critical path) | `feature/P2-energy-simulation` | P1 (merged) | everything |
| P3 — 3D Reconstruction | `feature/P3-3d-reconstruction` | P1 only | P2, P4, P5 (heat-loss overlay stubbed until P2 merges, then a small integration PR) |
| P4 — Building Editor (2D-first) | `feature/P4-building-editor` | P1 + P2 contract (`simulateBuilding`); branch off the P2 branch if P2 is in flight | P2, P3, P5 (3D picking integrated after P3 merges) |
| P5 — Scenario Management (headless: no P3/P4) | `feature/P5-scenario-management` | P1 + P2 contract; branch off the P2 branch if P2 is in flight | P2, P3, P4 (uses declarative change-sets = the P4 command vocabulary; full audit trail lands with P4) |
| P6/P7 — PDF / IFC import | `feature/P6-pdf-import`, `feature/P7-ifc-import` | P1 only | all of the above |

Recommended launch order: **P2 starts now; P3 starts now; P4 and P5 branch off the P2 branch and merge right after P2.** Canonical prompts: [P2](phases/P2-vibe-prompt.md) · [P3](phases/P3-vibe-prompt.md) · [P4](phases/P4-vibe-prompt.md) · [P5](phases/P5-vibe-prompt.md).

Rule for reviewers: never trust a green check alone — open the CI run and confirm steps executed (not `skipped`); see [docs/ci.md](ci.md).
