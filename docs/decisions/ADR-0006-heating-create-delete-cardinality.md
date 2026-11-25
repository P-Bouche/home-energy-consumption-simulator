# ADR-0006 — Heating Create/Delete: Collection Cardinality Rule for the Positional Overlay

## Status

**Accepted** — 2026-11-25 (issue #61)

## Context

Issue #61: a renovation may add a heating installation (wood stove, electric radiators as complement — mixed heating) or remove one. The command vocabulary only had `building.heating-system.update.v1/v2` targeting an existing `systemId`.

The blocker is ADR-0003: element ids are minted `<kind>-<i+1>` in source-document order, and the adapter's overlay maps `heating-3` → source collection index 2. Any create/delete changes the cardinality of `installation_chauffage_collection`, so the positional rule needs an explicit extension. Renumbering survivors after a delete is **forbidden** (ids are persisted in commands and audit rows).

## Decision

Two new versioned command tags (v1/v2 update tags stay frozen, ADR-0003/ADR-0004):

1. **`building.heating-system.create.v1`** — no `systemId`; the domain mints `heating-<seq+1>` from a **persisted high-water mark** (`Building.heatingSystemSeq`, so a deleted id is never reused even after reload — audit rows keep referencing it, ADR-0003). `description`, `generatorType` and `heatedAreaM2` are **required**: the engine cannot compute `ep_conso_5_usages` without a generator and a heated surface (it then omits the field and the result mapping fails). `installationType` optional. Undo of a delete restores the element at its original index with its original id (restoration path); undo of a create is a delete of the minted id.
2. **`building.heating-system.delete.v1`** — targets an existing `systemId`; removes it from the aggregate. **Rejected when it would leave zero heating systems** — a building with no heating installation is not simulable; an un-simulable state is never persisted.

**Overlay rule (adapter)**: the source document is always the verbatim import, so cardinality is derived, not stored: a source positional id (`heating-i`) absent from the simulation view = deleted → its source entry is dropped; a view id beyond the source length = created → a source entry **cloned from the first existing entry** is appended (the engine requires a complete `installation_chauffage`; a blank entry makes Open3CL throw — verified by e2e), then user fields including the generator type are overlaid. The collection is rebuilt in view order. Survivor ids are never renumbered. Engine-wise, `installation_chauffage` entries are independent, so order is irrelevant to results.

## Consequences

- Mixed heating becomes modelable end-to-end; the engine receives exactly the view's installations.
- No change to `Building` JSON shape: deletions are derived from id sets at mapping time (nothing new to persist; undo restores via the audit restoration path).
- The corpus contract test gains cases for append (create) and drop (delete) of heating entries.
- Same pattern applies to ventilation later if needed; other collections stay update-only for now.
