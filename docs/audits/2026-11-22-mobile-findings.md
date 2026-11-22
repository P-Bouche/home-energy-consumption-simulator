# Mobile findings — 2026-11-22 (M1, M2)

Follow-up to the 2026-11-21 UX audit (`docs/audits/2026-11-21-ux-audit.md`): two
mobile-responsiveness problems reported by the maintainer, **reproduced and measured**
on `main` @ f8dad7a (post-A1) with a real browser at a 390×844 px mobile viewport
(fixture `2238E0097309E.xml`, API `DATABASE_URL=memory://` + Vite dev server).

## M1 — 3D viewer page: the model renders on ~18 % of the screen width

**Measured (Chromium headless, 390 px viewport):** canvas width = **70 px (18 % of
viewport)**; side panel = **320 px fixed**, `position: static`, parent
`flex-direction: row`. On the reporter's device the canvas was ~10 % — same cause,
narrower screen.

**Root cause:**

- `apps/web/src/components/ElementPanel.tsx:18` — `sx={{ width: 320, … }}`, fixed width,
  no breakpoint;
- `apps/web/src/pages/ViewerPage.tsx:84-100` — row layout (`display: 'flex'`, canvas
  `flex: 1` + `<ElementPanel />`): 390 − 320 = 70 px left for the canvas. The panel is
  also **always visible**, even with no selection (placeholder text).

**Recommendation:** responsive layout — below `theme.breakpoints.down('md')`, switch to
column (canvas full-width on top, panel below) or an overlay/bottom-sheet panel,
collapsed by default when nothing is selected. Keep `data-testid`s (`viewer-3d`,
`element-panel`) stable for e2e. Note: PR #37 (wave-1 C) rewrites the viewer header/layout —
this fix should land with/after it to avoid conflicts.

**Evidence:** [mobile-03-viewer.png](assets/mobile-03-viewer.png),
[mobile-04-viewer-selected.png](assets/mobile-04-viewer-selected.png)

## M2 — Import page: workspace tabs unreachable by touch when they overflow

**Measured (Firefox mobile, 390 px viewport):** tabs scroller `scrollWidth = 1075` vs
`clientWidth = 358`, `overflow-x: hidden`, **0 scroll buttons**; the « Scénarios de
rénovation » tab sits at `x = 731` → off-screen, unreachable by touch (Playwright could
only click it by force-scrolling). In Chromium the labels compress and fit, but with a
larger font / Android text scaling the bar overflows the same way.

**Root cause:** `apps/web/src/components/WorkspaceShell.tsx:91-95` — `<Tabs>` in the
default standard variant, no `variant="scrollable"` / `scrollButtons`; `overflow:
hidden` blocks touch scrolling and there are no scroll buttons.

**Recommendation:** `variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile`
(or `variant="fullWidth"`) on the workspace `<Tabs>`. Checked and OK on mobile: the
workspace header buttons (`flexWrap: 'wrap'`, both in view) and the viewer header (no
horizontal overflow measured).

**Evidence:** [mobile-01-import-workspace.png](assets/mobile-01-import-workspace.png),
[mobile-02-after-tab-click.png](assets/mobile-02-after-tab-click.png)

## Method / caveats

- Real browser automation (Playwright), headless: Firefox for the workspace page
  (form fields), Chromium+SwiftShader for the WebGL viewer; DOM measurements via
  `getBoundingClientRect` / computed styles, not eyeballing.
- Viewport 390×844 (iPhone-14-class). Severity: M1 blocker on mobile, M2 major on mobile.
- No code changed; this branch only carries the evidence.
