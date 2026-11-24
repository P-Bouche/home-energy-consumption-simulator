# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Pre-existing descriptive labels

This repo already used descriptive labels before the triage roles were introduced: `enhancement`, `architecture`, `documentation`, `decision-request`, `priority: critical|high|medium|low` (plus GitHub's defaults). They are orthogonal to the five triage roles: keep them as-is and add the role label on top. Do not rename them into roles — `decision-request` describes the *kind* of work, while `ready-for-human` describes the *next actor*.
