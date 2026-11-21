# Mission: wave-1 A2 — collapsed import report, copy hygiene, MUI theme (UX US 6, 11; UI F1, F2)

Open ONE pull request on branch `feat/web-report-and-theme` targeting `main`. Leave it open for
review; do not merge. Read `AGENTS.md` first, then both audits
(`docs/audits/2026-11-21-ux-audit.md`, `docs/audits/2026-11-21-ui-3d-audit.md`): you are
implementing **UX US 6 and 11 plus UI findings F1 and F2**. Presentation-only; no API/domain/engine
changes; frozen contracts (element ids per ADR-0003, command payloads, cache keys) untouched.

**File ownership (wave-1 rule, see `docs/ux/README.md`):** you own the new theme file
(`apps/web/src/theme.ts`), `apps/web/src/components/ImportReportView.tsx`, **only the
`upload-success` alert line in `apps/web/src/pages/UploadPage.tsx`** (A1 owns the rest of that
file — expect to rebase on A1 after it merges; merge order A1 → A2), the « (P5) » tag in
`apps/web/src/components/ScenarioPanel.tsx`, and a new `BuildingLabel` component. Do NOT
restructure the page navigation or the simulation panel (that is A1) and do NOT touch the editor
dialog/catalog (B) or viewer files (C). Work against current `main`; keep your components
container-agnostic so A1's tabs can host them without conflicts.

## What to build

1. **Import report collapse (US 6)**: each report section becomes an MUI Accordion with a count
   in the header; inferred fields render as trust-critical cards (value + plain-language source +
   confidence); the unrecognized-paths list collapses to « N chemins non reconnus » with an
   expandable list AND a copy/download action.
2. **Copy hygiene (US 11)**: no internal phase tags ("P5"…) in any user-facing title; building
   UUIDs in headers/alerts replaced with a human building label derived from the DPE number
   (present in the import report data) via the new `BuildingLabel` component — the raw id stays
   in secondary monospace detail. Raw XML paths never appear in primary text.
3. **Theme tokens (UI F1/F2)**: one real theme file in `apps/web`: restrained palette (no
   default-MUI blue/purple), `shape.borderRadius: 10`, `typography.button.textTransform: 'none'`,
   a font actually loaded (bundled woff2 or a realistic system stack), consistent Paper
   elevation, exactly one contained primary action per screen/**region** (A1 puts the single
   primary action « Lancer la simulation » in the workspace header — do not add a competing one).

## Constraints and quality bar

- Same behavioral guarantees as always (undo, audit trail, 409, comparison table).
- Update `docs/user-guide.md` in the same PR — **only the §2 report paragraph**; quoted labels
  must match the new UI literally (checked at review).
- Tests: e2e spec for the accordion collapse + count; keep unit tests green; keep `data-testid`
  stable.
- Run the app, screenshot before/after of the report panel into `docs/audits/assets/`;
  reference in the PR body.
- CI fully green (6 checks) on the PR head. PR body states which audit US/findings are closed
  (US 6, 11; UI F1, F2) and anything left out.
