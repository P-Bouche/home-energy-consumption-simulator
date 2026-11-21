# Mission: wave-1 B — plain-language editor, level S (UX audit US 1, 8, 9 = the BLOCKER)

Open ONE pull request on branch `feat/web-editor-plain-language` targeting `main`. Leave it open
for review; do not merge. Read `AGENTS.md` first, then `docs/audits/2026-11-21-ux-audit.md`: you
are implementing the **"S — label and explain"** option of the editor deep-dive (US 1 partially,
US 8, US 9). Level S only — presets (M) and work-first editing (L) are future missions; do not
build them.

## The contract you must not break

The command layer is frozen: the web still sends the exact same `building.*.update.v1` payloads
with raw DPE enum ids and numeric U values. This mission changes ONLY the input experience
(labels, validation display, guided input), not what is sent. A homeowner-friendly surface over
an expert contract. Element ids (ADR-0003), cache keys, and the simulation pipeline are untouched.

## What to build

1. **Enum label service** — corrected wiring (apps/web does NOT depend on
   `@hes/open3cl-adapter`, and the published engine 1.11.6 entry point does NOT export the enum
   tables — see ADR-0001's measured export list):
   a. In `packages/open3cl-adapter/src/enum-labels.ts` (NEW, **pure static typed data — no
      `@open3cl/engine` import**, so the ESLint ADR-0001 boundary stays intact): vendor the
      id→French-label tables copied from `@open3cl/engine@1.11.6` sources (`src/enums…`, MIT),
      with a provenance comment (source file + version + license). If a future engine pin exports
      them live, prefer the live export — note it in the PR.
   b. Export it additively from `packages/open3cl-adapter/src/index.ts`.
   c. Expose it to the web through **exactly one additive read-only endpoint**
      `GET /enums/:kind` in `apps/api` (which already depends on the adapter) + additive OpenAPI
      doc. No existing endpoint or contract changes.
   d. Web side: `apps/web/src/services/enum-labels.ts` fetches/caches per enum kind. One lookup
      per enum kind used by the editor and scenario catalog: orientation, wallType,
      adjacencyType, glazingType, frameMaterial, installationType, ventilationType (see
      `command-catalog.ts` KINDS). **Test: every enum id used by the catalog/fixtures maps to a
      label; an unknown id shows the raw id with an honest flag — never guess a label.**
2. **Labeled inputs**: every enum field in the edit dialog and the scenario form becomes a
   labeled Select/autocomplete showing the French label first ("Nord"), raw id in secondary
   text. Prefill selects the current value.
3. **Guided U input**: U fields keep a numeric input but gain (a) min/max bounds — **the
   command catalog has no ranges today: add `min`/`max` to the catalog entries in apps/web**
   (presentation data, with a comment "mirrors domain invariants `U_VALUE_MAX` etc. — the domain
   remains the enforcing layer"), 0–4 W/m².K for walls, (b) a plain-language reading of current
   and typed value ("mur non isolé" / "isolation moyenne" / "très bonne isolation" — thresholds
   stated in the PR body), (c) catalog example descriptions promoted into helper/placeholder
   text.
4. **French validation** — translate at the RENDER layer only: the store keeps the raw API
   message (so `apps/web/test/editor-store.test.ts` stays green untouched); the dialog component
   maps error templates with interpolation (e.g. `must be in (0, 4] W/m².K` →
   « U doit être compris entre 0 et 4 W/m².K »), keeps the raw technical message in a detail
   expander, and falls back to the raw message for unknown templates. Update the e2e assertion in
   `tests/e2e/building-editor.spec.ts` (currently `/must be in \(0, 4\]/`) to the French message.
5. **Raw values remain reachable**: an « Afficher les valeurs techniques » toggle in the dialog
   shows the raw ids/values exactly as they will be sent (trust + debuggability).

## Constraints and quality bar

- NO domain changes; the adapter change is additive (new data file + export). AC-P2-02 contract
  tests must stay green.
- Unit tests: label mapping for every enum kind (incl. one unknown-id case), U-reading
  thresholds, error-message mapper (incl. unknown-error fallback).
- e2e (you own `tests/e2e/building-editor.spec.ts`): edit wall → invalid value shows the French
  message → save still produces the SAME command payload (assert version bump as today).
- Update `docs/user-guide.md` in the same PR — **only §5, steps 3–4** (dialog behavior wording).
- Run the app and screenshot the new dialog into `docs/audits/assets/`; reference in the PR body.
- CI fully green (6 checks) on the PR head.

PR body must list which enum kinds are labeled, the U-reading thresholds chosen, and confirm the
command payloads are byte-identical (verified at review against `building.*.update.v1`).
