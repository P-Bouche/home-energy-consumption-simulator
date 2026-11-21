# UX wave 1 — mission prompts

Source: UX audit `docs/audits/2026-11-21-ux-audit.md` (11 user stories, backlog §"Prioritized backlog") and UI/3D visual audit `docs/audits/2026-11-21-ui-3d-audit.md` (PR #24). Both audits are merged; read them before starting any mission.

Wave 1 = 4 parallel missions (prompts in this directory):

| Mission | Issue | Prompt file | Branch | Audit items | Owns (files) |
| --- | --- | --- | --- | --- |
| A1 — workspace shell (tabs, primary action, Synthèse) | **#26** | `wave1-A1-workspace-tabs.md` | `feat/web-workspace-shell` | UX US 2, 3 | `apps/web/src/App.tsx`, `apps/web/src/pages/UploadPage.tsx` (layout only — the success-alert line stays byte-identical, A2 owns its text), `apps/web/src/components/SimulationPanel.tsx`, new workspace component, new `apps/web/src/services/confidence-words.ts` |
| A2 — collapsed report, copy hygiene, theme | **#27** | `wave1-A2-report-theme.md` | `feat/web-report-and-theme` | UX US 6, 11 + UI F1, F2 | new `apps/web/src/theme.ts`, `apps/web/src/components/ImportReportView.tsx`, the alert line in `UploadPage.tsx`, the « (P5) » title in `ScenarioPanel.tsx`, new `BuildingLabel` component |
| B — plain-language editor, level S | **#28** | `wave1-B-editor-plain-language.md` | `feat/web-editor-plain-language` | UX US 1 (level S), 8, 9 | `packages/open3cl-adapter/src/enum-labels.ts` (new, data-only) + additive export + one additive API endpoint, `apps/web` editor/catalog/enum service, e2e `building-editor.spec.ts` |
| C — 3D visual pass | **#29** | `wave1-C-3d-visual-pass.md` | `feat/web-3d-visual-pass` | UX US 5 (visual part) + UI F8–F12 | `packages/geometry/src/three-adapter.ts`, `apps/web` viewer files (`ViewerPage`, `BuildingModel`, `ViewerOverlays`, `heat-loss.ts`, `view-colors.ts`, `viewer-store.ts`), e2e `viewer.spec.ts` |

**Merge order: A1 → A2 → B → C** (B and C commutable). A2 rebases on A1 (one-line alert conflict expected and accepted). Later missions rebase on `main` after each merge.

## Shared guards (in every prompt)

1. **Read `AGENTS.md` first.** Repo rules apply: strict TS, no `any`, domain purity, conventional commits, ESLint boundaries.
2. **Frozen contracts — do not change**: element ids (`<kind>-<i+1>`, ADR-0003), command payloads `building.*.update.v1`, `meshHash`/geometry inputs, cache keys, simulation port. All wave-1 work is presentation-only over these contracts. Exception: none in wave 1 (geometry changes are a separate wave-3 mission with its own ADR).
3. **Engine boundary (ADR-0001)**: `@open3cl/engine` may only be imported inside `packages/open3cl-adapter`. Engine enum label tables are **not exported** by the published 1.11.6 entry point (measured in ADR-0001) — they are vendored as static data (see mission B).
4. **User guide is checked at review**: `docs/user-guide.md` quotes UI labels literally. Each mission updates **only its own section** (A1: §2–3 navigation/simulation, A2: §2 report paragraph, B: §5, C: §7) in the same PR. Never edit another mission's section.
5. **E2E**: keep `data-testid` attributes stable; each mission touches only its own spec. Visible-label changes must update the spec in the same PR.
6. **CI fully green (6 checks)** on the PR head: Lint, Typecheck, Tests + coverage gate, E2E, Open3CL benchmark, Geometry benchmark.
7. **One PR per mission branch, left open for review — never merge yourself.** PR body lists the audit US/findings closed, evidence (screenshots in `docs/audits/assets/`, referenced), and anything deliberately left out.

Wave 2 (missions D and E) starts only after A1+B are merged: **D = issue #30** ("impact en clair" + "confiance en mots" components grafted onto A1's workspace and B's editor — reuses `confidence-words.ts`), **E = issue #31** (work-based scenarios reusing B's enum-label service). Wave 3: **#32** (editor level M presets + L decision, blocked by #28) and **#33** (3D geometry Class B — own ADR, blocked by #29).

**Issue linkage rule:** each mission's PR body ends with `Closes #<issue>` (A1 → `Closes #26`, A2 → `Closes #27`, B → `Closes #28`, C → `Closes #29`). Dependency issues #30–#33 are closed by their own future PRs, not by wave-1 PRs.
