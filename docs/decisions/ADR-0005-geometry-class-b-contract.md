# ADR-0005 — 3D Geometry Class B: Pitched Roof, Real Openings, Multi-Level

## Status

**Accepted** — 2026-11-25 (issue #33, maintainer decision)

## Context

The UI audit (docs/audits/2026-11-21-ui-3d-audit.md §6) splits 3D fidelity into Class A (visual pass, done) and **Class B** (geometry-level). Class B is the first intentional change to the geometry contract since P3:

- **Pitched roof** (gable along the long axis, ridge height from `roofType`/description with a default rule) instead of a flat slab — data exists in the DPE, slope is currently not modeled.
- **Openings as real holes** in wall quads (subtract window/door rectangles at inferred sill/height) with a recessed frame, instead of floating panels offset +0.05 m from the wall plane.
- **Multi-level stacking** from `levelCount` (footprint per level is already computed) with floor slabs between levels.

All three change the generated meshes, so the geometry contract — `INFERENCE_RULES_VERSION`, the mesh hash, and the API/e2e geometry assertions — must move deliberately, not silently.

## Decision

Implement Class B in `packages/domain/src/reconstruction.ts` (plus `geometry.ts` types) under an explicit version bump:

1. **Bump `INFERENCE_RULES_VERSION` from `1.0.0` to `2.0.0`** and add named inference rules with confidence weights for the new inferences: ridge height from `roofType` (default rule when absent), opening sill/height, per-level wall stacking. Every inferred value keeps the AGENTS.md §3 confidence rule — `{ value, source, confidence, importDate }`, never presented as measured.
2. **Mesh-hash / geometry contract tests change accordingly**: hash inputs and API/e2e geometry assertions are updated in the same PR; old hashes are not reinterpreted (versioned, per ADR-0003's corollary).
3. **Untouched frozen contracts**: element-id minting and positional overlay (ADR-0003), the v1/v2 command vocabulary (ADR-0004), Open3CL as sole engine (ADR-0001). Class B is presentation geometry only — it must never alter simulation inputs.

## Consequences

- The 3D viewer reads as an honest house (roof shape, window openings, stacked levels) within what DPE data supports; anything beyond (chimney, set dressing) stays out or is explicitly labeled synthetic.
- Reconstruction output for the same building changes shape under version `2.0.0`; consumers keying on mesh hash or `INFERENCE_RULES_VERSION` must branch on the version.
- Performance budget (AGENTS.md §7, 3D reconstruction < 2 s) is re-benchmarked with the new geometry.
