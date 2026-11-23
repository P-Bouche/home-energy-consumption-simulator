# JOURNAL of the PoC harness

This file is **append-only**: each run adds an entry at the end, and no
existing entry is ever modified. It is versioned in the repository and replaces
the copy-pasting of context between agents: every run, and every human, reads
it to know where the workstream stands.

Entry format:

```
## <timestamp> - <slug>
- Task: <description>
- Test verdict: PASS | FAIL (rounds: N)
- Branch: poc-...
- Plan: harness-poc/plans/<slug>.md
```

---

(The kit is installed: the first entry will come from the first run.)
