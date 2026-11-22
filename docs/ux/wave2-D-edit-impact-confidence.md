# Mission: wave-2 D — plain-language edit impact + confidence wording everywhere (UX US 4, 7)

Open ONE pull request on branch `feat/web-edit-impact-confidence` targeting `main` — **issue #30 (PR body ends with `Closes #30`)**. Leave it open for
review; do not merge. Read `AGENTS.md` first, then both audits
(`docs/audits/2026-11-21-ux-audit.md`, `docs/audits/2026-11-21-ui-3d-audit.md`): you are
implementing **UX US 4 and US 7 (findings F4 and F6)**. Wave-1 blockers #26 and #28 are merged —
this mission is unblocked. Presentation-only; no API/domain/engine changes; frozen contracts
(element ids per ADR-0003, command payloads `building.*.update.v1`, cache keys, `meshHash`) untouched.

**File ownership (wave-2 rule, see `docs/ux/README.md`):** you own
`apps/web/src/components/BuildingEditorPanel.tsx` (edit-impact summary + confidence wording of the
element rows and the audit area), `apps/web/src/components/ElementPanel.tsx` (3D side panel), the
« Synthèse » panel from A1 (aggregation of estimated values), new shared presentation components
(e.g. an `ImpactSummary`), and the e2e specs covering exactly those components
(`tests/e2e/building-editor.spec.ts` end to end; in `tests/e2e/viewer.spec.ts` only the
ElementPanel-related assertions). Reuse `apps/web/src/services/confidence-words.ts` (A1/B) — do not
reimplement it, extend by composition if needed. Do NOT touch `ImportReportView.tsx` (A2's inferred
cards are already in plain words), the scenario form (`ScenarioPanel.tsx` — mission E owns it),
or any command/payload construction code.

## What to build

1. **Impact of each edit, right where it happened (US 4 / F4)**: after each save, the editor shows a
   summary computed from the before/after `SimulationResult`: « Simulation relancée : −X kWh/an,
   étiquette D → C » (add the CO₂e delta when it changes). Honest wording when the label does not
   change (« étiquette D inchangée ») and when there is no previous result yet (first run: show the
   result without a delta). Below it, a plain-language value diff of what the command changed
   (« U du mur wall-1 : 1,64 → 0,20 », French decimal comma). Raw audit trail kept as opt-in
   technical detail behind an expander — never removed.
2. **Confidence in words at every point of decision (US 7 / F6)**: editor element rows and the 3D
   side panel render « mesuré par le DPE » vs « estimé — à vérifier » via the shared confidence
   wording; the numeric score stays only as a subtle secondary indicator; the raw source path sits
   behind a « d'où vient cette valeur ? » detail. The « Synthèse » tab aggregates the estimated
   values in one place instead of chips repeated on every row. The import-report cards (A2) already
   do this — leave them alone.
3. **Shared components**: impact summary and confidence wording live in reusable,
   container-agnostic components so the editor, the Synthèse tab and the 3D panel stay consistent.

## Constraints and quality bar

- Update `docs/user-guide.md` in the same PR — only the paragraphs whose visible labels your
  mission changes (the editor section and the 3D side-panel wording). Quoted labels must match the
  new UI literally (checked at review). Never edit another section.
- Tests: unit tests for the delta/wording helpers (French formatting, unchanged-label case,
  no-baseline case); e2e asserts the impact line against the known fixture figures
  (wall-1 U 1,6393 → 0,20 → étiquette D → C) and the new plain-word confidences. Keep existing
  `data-testid` stable; new ids for new elements only.
- Run the app; before/after screenshots of the editor panel and side panel into
  `docs/audits/assets/`; reference them in the PR body.
- CI fully green (6 checks) on the PR head. PR body states which audit US/findings are closed
  (US 4, 7 / F4, F6) and anything deliberately left out.
