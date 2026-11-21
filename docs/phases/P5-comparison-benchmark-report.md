# P5 — Scenario comparison benchmark (AC-P5-01 / TR-P5-03)

| Field | Value |
| --- | --- |
| Budget | comparison p95 < 1000 ms for ≤ 10 scenarios, all results cached (FR-P5-04) |
| Measured on | Node v24.14.1, linux x64, 5 vCPU, 5.9 GB RAM |
| Date | 2026-11-21T08:10:41.533Z |
| Fixture | packages/open3cl-adapter/test/fixtures/2238E0097309E.xml (real DPE import) |
| Scenarios | 10 (P4 `building.wall.update.v1` commands, distinct U-values) |
| Iterations | 100 cached compares of baseline + 10 scenarios |
| Engine calls during timed phase | 0 (input-hash cache + hash-verification staleness oracle; counter asserted unchanged) |

| Metric | ms |
| --- | --- |
| p50 | 2.441 |
| p95 | 2.890 |
| max | 3.585 |

Result: PASS (p95 2.890 ms < 1000 ms)

The comparison itself is pure domain computation (ComparisonService over cached SimulationResultRecords); the timed phase performs no engine call and no I/O beyond the in-memory repositories.
