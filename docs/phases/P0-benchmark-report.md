# P0 Benchmark Report — Open3CL Simulation Latency

Generated: 2026-11-19T15:53:10.003Z

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
| min | 2.3 |
| p50 | 7.9 |
| p95 | 23.9 |
| max | 26.4 |
| mean | 9.4 |

**AC-P0-03 (p95 < 3000 ms): PASS**

## Fixtures

| Fixture | Size (bytes) | Runs (ms) |
| --- | --- | --- |
| 2238E0097309E.xml | 38939 | 8.0, 8.1, 6.8 |
| 2260E1364581G.xml | 36110 | 4.0, 4.4, 4.8 |
| 2262E0170610J.xml | 37935 | 3.3, 2.9, 2.9 |
| 2287E1201982M.xml | 114349 | 7.3, 7.6, 6.5 |
| 2292E0764683M.xml | 91337 | 5.7, 5.7, 6.0 |
| 2313E0178624T.xml | 34802 | 3.9, 3.6, 3.6 |
| 2321E3872263C.xml | 537771 | 26.4, 23.9, 24.1 |
| 2337E2210396T.xml | 68617 | 5.5, 4.2, 4.2 |
| 2364E0984413P.xml | 310457 | 14.5, 14.0, 14.3 |
| 2368E1266847P.xml | 291250 | 12.5, 12.3, 12.7 |
| 2374E2700849T.xml | 280916 | 13.6, 13.4, 13.8 |
| 2375E2236932V.xml | 39023 | 2.3, 2.4, 2.4 |
| 2387E0888781I.xml | 156092 | 8.6, 7.9, 8.6 |
| 2459E1831723H.xml | 282403 | 11.2, 11.7, 12.2 |
| 2535E0426429Q.xml | 282472 | 16.4, 16.7, 16.6 |

## Notes

- Fixtures are real DPE XML files from the Open3CL engine test corpus (git clone); no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join this corpus after privacy review.
- The engine logs diagnostics to stderr; stdout of the CLI stays clean JSON.
