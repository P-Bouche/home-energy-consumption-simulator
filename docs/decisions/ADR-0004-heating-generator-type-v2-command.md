# ADR-0004 — Heating Generator Type Exposed via a v2 Command

## Status

**Accepted** — 2026-11-24 (issue #47 investigation)

## Context

Issue #47 asked whether a heating *generator* type (e.g. "Chaudière gaz condensation", "PAC air/eau") can influence the Open3CL result, or whether presets showing such labels would be dishonest (AGENTS.md §4: Open3CL is the single source of truth for energy figures).

Investigation findings:

- **The engine consumes it.** `9_generateur_ch.js` reads `enum_type_generateur_ch_id` and resolves generator efficiency through the `tv` tables keyed by generator type (`generateur_combustion`, …; `enums.type_generateur_ch`). Generator type therefore drives rendement and the consumption / DPE label.
- **Imported DPEs carry it.** The adapter fixtures contain `generateur_collection` with `enum_type_generateur_ch_id` (e.g. `88`), and the adapter overlays user edits onto the parsed source document, so the imported generator flows into the engine unchanged today.
- **Our model cannot edit it.** `HeatingSystem` exposes only `description`, `installationType`, `heatedAreaM2`, and the v1 command vocabulary (`building.heating-system.update.v1`) has no generator field; the adapter's enum tables (9) include no generator table. A preset card showing "PAC air/eau" would change nothing in the simulation.

Conclusion: **exposed and mappable** — the gap is our command vocabulary, not the engine.

## Decision

Add a generator-type field end-to-end, behind a new versioned command tag so the frozen v1 contract (ADR-0003) is untouched:

1. **Domain**: `HeatingSystem` gains `generatorType: Confidence<string> | null` (DPE `enum_type_generateur_ch_id`, stored with the usual confidence metadata).
2. **Command vocabulary**: new tag `building.heating-system.update.v2`, a superset of v1 adding `generatorType`. v1 tags are never renamed or extended in place (`COMMAND_VOCABULARY_VERSION` bump rule in `commands.ts`).
3. **Adapter**: overlays `generatorType` into `installation_chauffage/generateur_collection/generateur/donnee_entree/enum_type_generateur_ch_id`, position-pinned per ADR-0003; the enum-labels module gains the `type_generateur_ch` table so the editor can show French labels.
4. **Editor presets** (issue #32) must use the v2 command; no preset may display a generator label that has no effect on the engine result.

## Consequences

- Heating presets become honest: every preset label maps to a real engine input that changes the result.
- The DPE importer should map `enum_type_generateur_ch_id` into `HeatingSystem.generatorType` (with confidence metadata) so imported values round-trip.
- Implementation lands with issue #32 (editor level M); this ADR records the contract only.
