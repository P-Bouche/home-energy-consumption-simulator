# P2 Simulation Benchmark Report — Building → Open3CL Simulation Latency

Generated: 2026-11-20T16:24:02.889Z

## Machine

- CPU: INTEL(R) XEON(R) PLATINUM 8581C CPU @ 2.30GHz (5 vCPU)
- RAM: 5.9 GB
- Platform: linux x64
- Node.js: v22.23.5
- Engine: @open3cl/engine 1.11.6 (pinned)

## Method

- 15 DPE XML fixtures (P0/P1 corpus, sizes 34802–537771 bytes)
- Each fixture is imported once into the Building aggregate (DpeXmlImporter), then `Open3clAdapter.simulateBuilding(building)` is timed
- 1 warm-up run per fixture, then 3 timed runs per fixture (total 45 samples)
- Latency covers view projection + Building→engine input mapping + pinned engine + result mapping (no HTTP, no DB)
- Percentiles: nearest-rank; budget p95 < 3000 ms (AC-P2-01)

## Results

| Metric | Latency (ms) |
| --- | --- |
| min | 2.4 |
| p50 | 7.2 |
| p95 | 24.6 |
| max | 25.5 |
| mean | 9.1 |

**AC-P2-01 (p95 < 3000 ms): PASS**

## Fixtures

| Fixture | Size (bytes) | Runs (ms) |
| --- | --- | --- |
| 2238E0097309E.xml | 38939 | 6.9, 6.2, 7.0 |
| 2260E1364581G.xml | 36110 | 4.5, 3.1, 2.8 |
| 2262E0170610J.xml | 37935 | 3.0, 2.7, 2.5 |
| 2287E1201982M.xml | 114349 | 8.1, 6.3, 7.2 |
| 2292E0764683M.xml | 91337 | 6.3, 5.4, 5.3 |
| 2313E0178624T.xml | 34802 | 3.2, 2.6, 2.7 |
| 2321E3872263C.xml | 537771 | 25.3, 25.5, 24.6 |
| 2337E2210396T.xml | 68617 | 4.6, 4.5, 4.2 |
| 2364E0984413P.xml | 310457 | 14.1, 14.5, 13.9 |
| 2368E1266847P.xml | 291250 | 12.6, 11.9, 12.4 |
| 2374E2700849T.xml | 280916 | 12.9, 13.1, 12.8 |
| 2375E2236932V.xml | 39023 | 2.4, 2.5, 2.4 |
| 2387E0888781I.xml | 156092 | 8.3, 9.1, 8.3 |
| 2459E1831723H.xml | 282403 | 11.7, 12.1, 11.5 |
| 2535E0426429Q.xml | 282472 | 16.4, 15.1, 15.5 |

## Notes

- Fixtures are the real DPE XML corpus checked in at packages/open3cl-adapter/test/fixtures/; no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join this corpus after privacy review.
- The engine logs diagnostics to stderr; stdout of the benchmark stays clean JSON.
