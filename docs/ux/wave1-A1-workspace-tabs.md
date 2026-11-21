# Mission: wave-1 A1 — post-import workspace tabs, primary action, Synthèse tab (UX audit US 2, 3)

Open ONE pull request on branch `feat/web-workspace-shell` targeting `main`. Leave it open for
review; do not merge. Read `AGENTS.md` first, then `docs/audits/2026-11-21-ux-audit.md`: you are
implementing **US 2 and US 3 only**. This is presentation-only: NO API, domain, engine, or
geometry changes; element ids (ADR-0003), command payloads `building.*.update.v1`, and cache
keys are frozen contracts and must not change.

**File ownership (wave-1 rule, see `docs/ux/README.md`):** you own `apps/web/src/App.tsx`,
`apps/web/src/pages/UploadPage.tsx` (**layout/tabs only — leave the `upload-success` alert line
byte-identical; its wording is mission A2's**), `apps/web/src/components/SimulationPanel.tsx`
(the primary button moves out of it into the workspace header), plus new files (e.g.
`apps/web/src/components/WorkspaceShell.tsx`, `apps/web/src/services/confidence-words.ts`).
Do NOT touch: the theme file, `ImportReportView.tsx` layout, UUID/tag wording (A2), the editor
dialog or command catalog (B), any viewer file (C).

## What to build

1. **Workspace with tabs**: after an import, the stacked page becomes a tabbed workspace:
   « Synthèse » (new, landing tab), « Rapport d'import », « Éditeur du bâtiment »,
   « Scénarios de rénovation ». The 3D viewer stays on its own route; add a persistent
   « Voir le modèle 3D » action in the workspace header. One tab = one dominant region.
2. **Synthèse tab**: DPE energy/climate labels + key figures (kWh/m².an, kg CO₂/m².an, totals,
   engine version), the list of inferred values expressed in plain words ("estimé — à vérifier"),
   and the latest simulation result summary at the top.
   - Plain-words confidence: create `apps/web/src/services/confidence-words.ts`
     (`confidenceInWords(c: { source: string; confidence: number }): string`, e.g.
     measured → "mesuré par le DPE", inferred < 1 → "estimé — à vérifier") **with unit tests**.
     Mission D (wave 2) will reuse this helper in the editor/report/3D panel — keep it generic.
3. **Primary simulation action**: « Lancer la simulation » becomes the single `contained`
   primary button of the workspace header, always visible; the latest result summary
   (labels + key figures) renders at the top of the Synthèse tab. History, detail and raw
   engine JSON move behind expanders/dialogs (raw JSON becomes opt-in).

## Constraints and quality bar

- Keep every existing behavior working: undo, audit trail, the 409 conflict message,
  scenario comparison table (container only, no redesign). Panels keep their props contract —
  host them as-is inside tabs; do not change their props.
- Update `docs/user-guide.md` in the same PR — **only §2 (navigation) and §3 (simulation)** so
  every quoted label/flow matches the new navigation (the guide is checked at review).
- Tests: adjust/extend the e2e specs for the tabbed navigation (new spec or `upload`/`simulation`
  specs); keep `data-testid` attributes stable; keep unit tests green (add tests for
  `confidence-words.ts`).
- Run the app (`DATABASE_URL=memory:// npm run start -w apps/api`, `npm run dev -w apps/web`)
  with a repo fixture; screenshot the new workspace into `docs/audits/assets/` and reference
  the screenshots in the PR body.
- CI fully green (6 checks) on the PR head. PR body states which audit US are closed (US 2, 3)
  and anything left out.
