# TASKS: PoC harness backlog

Backlog of tasks to run. One entry per task, prioritised like the
`features.json` pattern of the Harness_Engineering template: when starting a
run, take the highest non-completed task.

```
- [ ] (P1) <task>
- [ ] (P2) <task>
- [x] (P1) <done task> — branch poc-... — <date>
```

To launch the next entry:

```bash
uv run harness-poc/orchestrate_poc.py "<description>"
```

---

- [ ] (P1) Add the weekly usage breakdown chart to the dashboard
- [ ] (P2) Fix the flaky e2e test in the simulation module
