# Mission: wave-1 C — 3D visual pass (UX US 5 visual part; UI audit F8, F9, F10, F11, F12)

Open ONE pull request on branch `feat/web-3d-visual-pass` targeting `main` — **issue #29 (PR body ends with `Closes #29`)**. Leave it open for
review; do not merge. Read `AGENTS.md` first, then `docs/audits/2026-11-21-ui-3d-audit.md`: you
are implementing the **Class A ("visual-only") items of §5/§6**. Geometry (Class B: pitched
roof, real openings, multi-level) is OUT of scope and will be its own wave-3 mission with its
own ADR; do NOT touch `packages/domain/src/reconstruction.ts`, the mesh hash, or any inference
rule.

**File ownership (wave-1 rule, see `docs/ux/README.md`):** you own the rendering boundary only:
`packages/geometry/src/three-adapter.ts` and the `apps/web` viewer files (`pages/ViewerPage.tsx`,
`components/BuildingModel.tsx`, `components/ViewerOverlays.tsx`, `services/heat-loss.ts`,
`services/view-colors.ts`, `store/viewer-store.ts`), plus `tests/e2e/viewer.spec.ts`. Do NOT
touch `UploadPage`/`App`/theme (A1/A2), the editor (B).

## What to build (all in the viewer rendering boundary)

1. **Up-axis fix** (F8 — the big one): domain geometry is Z-up
   (`packages/domain/src/geometry.ts` COORDINATE_SYSTEM) but three.js is Y-up; the adapter
   currently copies raw positions. Convert axes ONCE at the rendering boundary — root-group
   rotation −π/2 on X, or component remap (x,y,z)→(x,z,−y) in the three-adapter; pick one and
   state the choice in the PR body. Then a real 3/4 camera: azimuth ~45°, elevation ~30°,
   distance ≈ 1.8× the bounding sphere, OrbitControls with Y-up defaults + `maxPolarAngle` so
   the user cannot go under the ground plane. Unit test the axis conversion + reframe (must run
   without a GPU).
2. **Scene dressing** (F9): non-white background (Sky or vertical gradient), ground plane ~3×
   the footprint, soft shadows (PCFSoft, one warm directional sun + hemisphere fill),
   ACESFilmic tone mapping, ContactShadows under the building, `dpr [1, 2]`.
3. **Heat-loss normalization** (F10 — second real bug): `colorForShare` maps the RAW share onto
   green→red, so the legend's red is unreachable (max share ≈ 0.2 when ~11 elements share the
   total). Normalize per building run: `share / maxShare` (guard `maxShare = 0`) at the
   presentation layer; add the numeric share to the hover tooltip; redesign the legend as a
   gradient bar with min/max labels. Unit tests for the normalized mapping incl. the
   single-element edge case.
4. **Picking affordances** (F11): visible hover (emissive lift + cursor pointer), selection
   outline (Edges/LineSegments around the selected element) kept with the color mix; soften the
   inferred hatch (thinner/lower contrast) and add an « inféré » entry to the legend.
5. **Viewer chrome** (F12): header = AppBar/Toolbar with the DPE number (not the UUID; id in a
   monospace caption — if A2's `BuildingLabel` is merged, reuse it), heat-loss switch as a
   labeled control, gradient legend (3.), side panel with the theme radius and a definition
   list with mesuré/estimé chips, room labels occlusion-aware or toggleable, tooltips wrap
   (`maxWidth`) instead of overflowing.

## Constraints and quality bar

- Rendering-only. If the axis change lives in the three-adapter, domain objects and the geometry
  contract (`meshHash` inputs) stay untouched: **hashes must not change** — assert in/next to
  the existing geometry tests if a hash test exists.
- Element picking, tooltip content, and heat-loss values remain exactly derived from the same
  data — only presentation changes.
- Keep a WebGL-less smoke path: unit tests (axis conversion, normalized colors) run without a
  GPU; the e2e viewer spec stays passing (keep `data-testid`s stable).
- Run the app, screenshot the upright+grounded viewer (default view, and overlay on; any corpus
  fixture — state its energy label) into `docs/audits/assets/`, referenced in the PR body as
  before/after evidence.
- Update `docs/user-guide.md` in the same PR — **only §7**, if any viewer UI wording changes.
- CI fully green (6 checks) on the PR head.

PR body must state the axis-conversion choice (rotation vs remap) and show the before/after
screenshots.
