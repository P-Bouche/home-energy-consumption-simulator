# ADR-0003 — Element IDs Are a Frozen Contract with Source-Document Positions

## Status

**Accepted** — 2026-11-21 (issue #20)

## Context

Element ids are the most load-bearing **implicit** contract in the project. Today they hold by convention only — nothing in the repository recorded them as an enforced contract until now. Four phases depend on the same convention, each for a different reason:

- **P1 — import** (`packages/dpe-xml-importer`): the importer mints element ids as `<kind>-<i+1>` (`wall-1`, `window-2`, …) **in source-document order**, exactly one id per entry of the corresponding DPE collection — see `packages/dpe-xml-importer/src/mappers.ts` (`id: \`wall-${i + 1}\`` at lines 194, 216, 237, 258, 283, 324, 342, 357 for wall / roof / floor / window / door / heating / ventilation / pv, inside `.forEach((item, i) => …)` loops over each collection — loops at lines 184, 208, 229, 250, 275, 318, 335, 354).
- **P3 — 3D picking**: the geometry adapter stamps those ids on pickable mesh groups (`packages/geometry/src/buffers.ts:20,62`, `elementId: el.id`) and the viewer selects/hovered elements strictly by id (`apps/web/src/store/viewer-store.ts:55,95`). Stable ids make elements selectable and addressable from the UI.
- **P4 — edit commands**: commands target elements strictly by id with versioned tags (`building.<element>.update.v1`) — `packages/domain/src/commands.ts:17,37-38,129` (`idField: 'wallId'`, `kind: 'wall'`). Ids are persisted inside command JSON and audit rows, so they are also a data-stability requirement.
- **P5 — edited-building overlay**: the adapter maps a domain id back to a position in the parsed source document — `elementIndex(id, kind)` in `packages/open3cl-adapter/src/map-building-to-engine-input.ts:171` turns `wall-3` into index `2` (regex `^<kind>-(\\d+)$`, minus one), used by `overlayElements` at line 187 to patch exactly the intended entry of the source collection (`umur_saisi` + `enum_methode_saisie_u_id`, etc.). This is the **positional inverse of the importer's minting rule** and is only valid under the 1:1 document-order invariant.

The round-2 reviews of PR #16 and PR #17 flagged this: `hasUserEdits`/overlay detection relies on the stamped ids (#16), and the corpus-wide contract test was added in #17 round 2 as a non-blocking follow-up — this ADR is that follow-up (issue #20).

## Decision

**Element ids are minted by the importer as `<kind>-<i+1>`, in source-document order, exactly 1:1 with the entries of the corresponding DPE collection. This is a frozen architectural contract, not an implementation detail.**

Corollaries that consumers may rely on:

- `elementIndex(id, kind) = n - 1` for `id = "<kind>-<n>"` is the exact positional inverse of minting, and the P5 overlay uses it to address source collection entries;
- ids are stable for a given imported document: same DPE XML → same ids (pinned by the frozen `Building` snapshots in `packages/dpe-xml-importer/test/fixtures/snapshots/`);
- ids are meaningful to users and to persisted data (commands, audit, scenario change-sets), so they must not be re-minted after import.

Any change to this rule requires a new ADR superseding this one.

## Alternatives Considered

1. **Persist the source collection index (or XPath) on each domain element at import time** — *rejected for now (deferred)*. Makes the contract explicit data instead of a convention, and robust to future importer changes (merge/split of collection entries, re-minting). Trade-offs: schema + domain + persistence impact today (`Building` JSON, frozen snapshots, migrations), and the positional convention is already enforced by tests (see Safety net). Kept as the **migration path** if the 1:1 invariant ever has to break.
2. **Opaque ids (UUIDs) minted at import** — *rejected*: breaks the positional overlay round-trip entirely (the adapter could no longer map `wall-3` → index 2), and gives no picking-stability benefit over sequential ids.
3. **Keep the convention implicit, documented only in code comments** — *rejected* (this ADR exists because of that state): the round-trip is load-bearing across four phases; a silent drift would drop user edits from the engine input.

## Consequences

**Positive**

- The P5 overlay's positional mapping is valid and regression-guarded (see below); user edits provably reach the engine input (consumption drops, label D→C on the fixture corpus).
- P3 picking and P4/P5 commands address elements by stable, human-readable ids; persisted commands and audit rows remain meaningful.
- AC-P2-02 (byte-for-byte verbatim path for unedited buildings) is unaffected — the overlay only engages when a field carries `source: "user"`.

**Negative / constraints**

- The overlay's positional mapping is valid **only under this contract**. Any future importer change — merging or splitting collection entries, re-minting ids, switching to UUIDs — must either preserve the 1:1 document-order invariant or persist the source index (or XPath) on each domain element at import time, **with a migration story** for already-persisted buildings.
- If the invariant ever changes, the id→position mapping must be versioned explicitly (e.g. `idMappingVersion` recorded with the geometry/overlay), not silently reinterpreted.

## Safety net — enforcement points (regression guards)

*Citation note: line numbers in this ADR are exact as of commit `9a3b364` (this PR's base). Where an exported symbol exists — `elementIndex`, `overlayElements`, `assertOverlayCoversUserEdits` — the symbol name is the stable citation handle and survives refactors; line numbers are evidence, not the contract.*

These are the named guards; a change that breaks the contract must fail them:

- **Corpus-wide importer ↔ overlay contract test**: `packages/open3cl-adapter/test/overlay-corpus-contract.test.ts` — `describe('corpus-wide importer ↔ overlay contract (positional id mapping)')` (line 116); per-fixture test (line 122) asserts every user-edited element of every kind lands on the intended source collection entry (expected index recomputed from the id suffix at line 144); unmatched-id logging test (line 165); fail-loud test for user-sourced fields outside overlay coverage (line 184).
- **`assertOverlayCoversUserEdits(view)`**: `packages/open3cl-adapter/src/map-building-to-engine-input.ts:96`, invoked at line 424, exported from `packages/open3cl-adapter/src/index.ts:5` — fails loudly when a `user`-sourced field is outside the overlay-covered collections.
- **Unmatched-id logging in the overlay**: `overlayElements` (`map-building-to-engine-input.ts:187-200`) logs `NO MATCHING ENTRY IN THE RETAINED SOURCE DOCUMENT — user edits on this element were NOT overlaid` instead of silently skipping.
- **Engine-level proof**: `packages/open3cl-adapter/test/edited-building-overlay.test.ts` — `simulateBuilding` on an edited building runs the engine with the edit applied (consumption drops, label D→C, aggregate not mutated; lines 89, 109).
- **Importer side**: frozen `Building` snapshots (`packages/dpe-xml-importer/test/fixtures/snapshots/`) pin the minted ids for the whole 15-fixture corpus.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Importer changes minting (merge/split of collections, re-mint, UUIDs) | Medium | High | Corpus contract test + frozen snapshots fail loudly; per this ADR, preserve the 1:1 invariant or persist source index + migration |
| Overlay silently drops a user edit | Low | High | Unmatched-id logging + `assertOverlayCoversUserEdits` fail loudly; tests cited above |
| Id collision across kinds | Low | Medium | Kind prefix enforced by `elementIndex`'s `^<kind>-(\\d+)$` regex; kind is passed explicitly |
| P3 picking / P4-P5 commands break on id change | Medium | High | Ids are persisted in commands/audit JSONB — re-minting is a data migration, not a code change; snapshots pin current behavior |

## Reassessment Conditions

Reopen this ADR if: the importer ever needs to merge/split collection entries or re-mint ids (then adopt alternative 1 — persist the source index or XPath per element, with a migration — and version the id→position mapping); the overlay grows beyond positional mapping (e.g. inserting new elements into a collection); or a future consumer needs ids stable across *different* imported documents (then consider content-based ids, keeping the overlay mapping versioned).

## Cross-references

- [ADR-0001 — Open3CL as the core energy engine](ADR-0001-open3cl-as-core-engine.md) (the overlay stays inside the single engine boundary defined there)
- [ADR-0002 — Open3CL integration strategy](ADR-0002-open3cl-integration-strategy.md)
- PR #16 review, round 2 (overlay detection relies on the stamped `source: "user"` ids) · PR #17 review, round 2 (corpus contract test added there)
- Issue #20 (this ADR)
