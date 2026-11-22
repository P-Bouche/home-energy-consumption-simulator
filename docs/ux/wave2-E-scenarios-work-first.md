# Mission: wave-2 E — work-first scenario creation (UX US 10)

Open ONE pull request on branch `feat/web-scenarios-work-first` targeting `main` — **issue #31 (PR body ends with `Closes #31`)**. Leave it open for
review; do not merge. Read `AGENTS.md` first, then both audits
(`docs/audits/2026-11-21-ux-audit.md`, `docs/audits/2026-11-21-ui-3d-audit.md`): you are
implementing **UX US 10 (finding F7)**. Wave-1 blocker #28 is merged — this mission is unblocked.
Presentation-only; **scenario payloads and the command vocabulary `building.*.update.v1` are
unchanged**: a scenario built through the new flow must produce byte-identical commands.

**File ownership (wave-2 rule, see `docs/ux/README.md`):** you own
`apps/web/src/components/ScenarioPanel.tsx` (the comparison table itself stays as-is — audit
says keep it; only its container adapts), a new work-catalog service (e.g.
`apps/web/src/services/work-catalog.ts`), and `tests/e2e/scenarios.spec.ts`. You may read but
must NOT modify B's `command-catalog.ts`, `services/enum-labels.ts`, `services/u-reading.ts`
or `hooks/use-enum-labels.ts` — reuse them by composition. Do NOT touch the editor dialog
(mission D owns `BuildingEditorPanel.tsx`), viewer files, or the API/domain.

## What to build

1. **Work-first creation flow (US 10 / F7)**: the scenario form starts from named renovation works
   — « Isolation des murs », « Isolation de la toiture », « Isolation du plancher »,
   « Remplacement des fenêtres », « Changement du chauffage », « Changement de la ventilation » —
   instead of raw command rows. Each work maps internally to its command type(s) from the existing
   catalog; the target element is picked by plain name and location (« Mur nord — 54 m² »: labeled
   kind + orientation label resolved through B's `use-enum-labels`/`enum-labels` service +
   area, with the raw id in secondary detail); numeric parameters reuse B's guided U reading
   (`describeU`); enum parameters reuse B's labeled selects (raw id still sent).
2. **Payloads byte-identical**: the composed commands are exactly what the current form produces
   (same `type`, same field keys, raw DPE enum ids, numeric U). Prove it in e2e: build the same
   scenario through the new flow and assert the scenario's command list matches the frozen payload
   field by field.
3. **Advanced mode**: the current command-row editor stays reachable behind an « avancé » toggle,
   with every existing `data-testid` preserved — the U-field-width regression of
   `scenarios.spec.ts` must keep passing without modification.
4. **Comparison table untouched**: rank, Δ kWh, Δ kg CO₂e, label change render exactly as today;
   do not restyle it beyond what the surrounding container requires.

## Constraints and quality bar

- Update `docs/user-guide.md` in the same PR — only the scenario section. Quoted labels must
  match the new UI literally (checked at review). Never edit another section.
- Tests: e2e covers the work-first flow end to end (create two scenarios through the new flow,
  compare) plus the byte-identity payload assertion; the pre-existing scenarios e2e keeps passing
  through the advanced mode. Unit tests for the work-mapping (work → command type(s), target-kind
  filtering, guided helpers).
- Run the app; before/after screenshots of the scenario form into `docs/audits/assets/`;
  reference them in the PR body.
- CI fully green (6 checks) on the PR head. PR body states which audit US/findings are closed
  (US 10 / F7) and anything deliberately left out (e.g. works without a matching catalog command).
