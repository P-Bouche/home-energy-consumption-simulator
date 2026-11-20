# P0 Benchmark Report — Open3CL Simulation Latency

Generated: 2026-11-20T09:18:28.694Z

## Machine

- CPU: Intel(R) Xeon(R) 6985P-C CPU @ 2.30GHz (5 vCPU)
- RAM: 5.9 GB
- Platform: linux x64
- Node.js: v22.23.5
- Engine: @open3cl/engine 1.11.6 (pinned)

## Method

- 15 DPE XML fixtures (copied from the engine clone test corpus, sizes 34802–537771 bytes)
- 1 warm-up run per fixture, then 3 timed runs per fixture (total 45 samples)
- Latency measured around the full adapter call (`Open3clAdapter.simulate`, engine + mapping)
- Percentiles: nearest-rank method; budget p95 < 3000 ms (AC-P0-03)

## Results

| Metric | Latency (ms) |
| --- | --- |
| min | 2.4 |
| p50 | 8.0 |
| p95 | 24.2 |
| max | 25.6 |
| mean | 9.7 |

**AC-P0-03 (p95 < 3000 ms): PASS**

## Fixtures

| Fixture | Size (bytes) | Runs (ms) |
| --- | --- | --- |
| 2238E0097309E.xml | 38939 | 6.5, 7.2, 6.6 |
| 2260E1364581G.xml | 36110 | 3.5, 4.0, 4.0 |
| 2262E0170610J.xml | 37935 | 3.2, 2.8, 2.8 |
| 2287E1201982M.xml | 114349 | 8.0, 7.6, 6.4 |
| 2292E0764683M.xml | 91337 | 5.5, 5.5, 5.8 |
| 2313E0178624T.xml | 34802 | 3.8, 3.3, 3.5 |
| 2321E3872263C.xml | 537771 | 25.6, 24.2, 24.7 |
| 2337E2210396T.xml | 68617 | 5.6, 5.4, 9.2 |
| 2364E0984413P.xml | 310457 | 14.8, 14.4, 14.4 |
| 2368E1266847P.xml | 291250 | 12.9, 12.7, 12.3 |
| 2374E2700849T.xml | 280916 | 13.8, 14.7, 13.6 |
| 2375E2236932V.xml | 39023 | 2.5, 2.6, 2.4 |
| 2387E0888781I.xml | 156092 | 9.0, 8.1, 8.8 |
| 2459E1831723H.xml | 282403 | 11.0, 14.2, 11.9 |
| 2535E0426429Q.xml | 282472 | 15.8, 23.5, 16.7 |

## Notes

- Fixtures are real DPE XML files from the Open3CL engine test corpus (git clone); no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join this corpus after privacy review.
- The engine logs diagnostics to stderr; stdout of the CLI stays clean JSON.
