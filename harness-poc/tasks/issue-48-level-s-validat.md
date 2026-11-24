# Task (repo copy, 2026-11-23)

Issue #48 (decision only - DO NOT IMPLEMENT): Level S: validation findings (blocks #32 until fixed and re-validated)

## Context

The decision-only planner run on #32 (2026-11-23) reminded the precondition: level S (#28) must be validated in real usage before level M starts. Maintainer review on 2026-11-23 found the following issues. **#32 stays blocked until this issue is fixed and S is re-validated.**

## Findings reported by the maintainer

1. **Uw slider can exceed 4 via manual input.** The slider clamps to the domain range (U in (0, 4], `U_VALUE_MAX = 4` in `packages/domain/src/commands.ts`), but typing a value by hand appears to bypass the clamp. Check the numeric input validation path in `apps/web/src/components/BuildingEditorPanel.tsx`.
2. **Plain-language reading under the U value is illogical for windows.** Reported readings: Uw 0 → "baie vitrée non isolée", 1 → "baie vitrée peu isolée", but 2, 3 and 4 → "baie vitrée non isolée" again. Suspected band-threshold mapping bug in `apps/web/src/services/u-reading.ts` (`describeU` / `uBand`), or window-specific thresholds inverted or missing.
3. **Same illogical pattern for walls** (per the maintainer: "pareil pour mur") — verify each element kind's thresholds, not just windows.
4. **Solar factor Sw has no explanation.** The field is displayed without plain-language guidance, unlike the U fields.
5. **q4pa (air permeability) has no explanation for ventilation**, same gap as Sw.

## Expected outcome

- Bugs 1–3 fixed with unit tests on `u-reading.ts` band logic per kind + input clamping in the dialog.
- Gaps 4–5: plain-language readings added for Sw and q4pa in the same style as `describeU` (source: existing UX audit vocabulary).
- Then maintainer re-validates S in real usage, which unblocks #32.

## Constraints

- Presentation/validation layer only (`apps/web`); no contract change, no engine math.
- French wording consistent with the existing `describeU` style.

---
This is a DECISION-ONLY run. Read the issue above (github_get_issue #48
if you need the live version) and any documents it references, then produce:
1. A feasibility analysis grounded in this codebase (cite the files you read).
2. A single line: RECOMMENDATION: <choice> justified in the bullet points.
3. The remaining decision points for the maintainer.

Do not implement anything, do not modify any file.
