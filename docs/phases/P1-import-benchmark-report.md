# P1 Import Benchmark Report — DPE XML Import Latency

Generated: 2026-11-20T12:48:27.575Z

## Machine

- CPU: Intel(R) Xeon(R) 6985P-C CPU @ 2.30GHz (5 vCPU)
- RAM: 5.9 GB
- Platform: linux x64
- Node.js: v24.14.1

## Method

- 15 DPE XML fixtures (P0 corpus, sizes 34802–537771 bytes)
- 1 warm-up run per fixture, then 5 timed runs per fixture (75 samples total)
- Latency measured around the full import pipeline: well-formedness validation + hardened fast-xml-parser parse + DPE schema validation + mapping to the Building aggregate + ImportReport v1 build (no HTTP, no DB — the API adds a few ms of multipart/JSONB handling)
- Percentiles: nearest-rank; budget p95 < 1000 ms (AC-P1-01, files up to 5 MB)

## Results

| Metric | Latency (ms) |
| --- | --- |
| min | 3.7 |
| p50 | 17.8 |
| p95 | 304.2 |
| max | 336.2 |
| mean | 59.2 |

**AC-P1-01 (p95 < 1000 ms): PASS**

## Schema variants covered

- modele=1/version=2
- modele=1/version=2.1
- modele=1/version=2.2
- modele=1/version=2.3
- modele=1/version=2.4

## Fixtures

| Fixture | Size (bytes) | Variant | Runs (ms) |
| --- | --- | --- | --- |
| 2238E0097309E.xml | 38939 | modele=1/version=2 | 7.0, 7.6, 6.6, 6.4, 5.7 |
| 2260E1364581G.xml | 36110 | modele=1/version=2.1 | 5.0, 5.5, 5.5, 5.3, 6.0 |
| 2262E0170610J.xml | 37935 | modele=1/version=2 | 5.5, 6.0, 6.5, 6.2, 6.5 |
| 2287E1201982M.xml | 114349 | modele=1/version=2.1 | 19.5, 17.5, 17.4, 17.9, 17.8 |
| 2292E0764683M.xml | 91337 | modele=1/version=2 | 10.8, 10.8, 10.7, 13.8, 13.8 |
| 2313E0178624T.xml | 34802 | modele=1/version=2.2 | 4.6, 4.4, 4.5, 4.0, 4.1 |
| 2321E3872263C.xml | 537771 | modele=1/version=2.3 | 309.4, 336.2, 301.2, 304.2, 307.9 |
| 2337E2210396T.xml | 68617 | modele=1/version=2.3 | 12.0, 11.4, 11.0, 11.5, 11.4 |
| 2364E0984413P.xml | 310457 | modele=1/version=2.2 | 74.3, 75.5, 76.2, 74.3, 79.8 |
| 2368E1266847P.xml | 291250 | modele=1/version=2.2 | 81.2, 82.7, 81.9, 80.6, 80.3 |
| 2374E2700849T.xml | 280916 | modele=1/version=2.3 | 84.7, 76.7, 73.8, 72.5, 72.7 |
| 2375E2236932V.xml | 39023 | modele=1/version=2.3 | 3.8, 3.7, 3.8, 3.8, 4.2 |
| 2387E0888781I.xml | 156092 | modele=1/version=2.2 | 22.6, 22.2, 22.4, 22.1, 23.2 |
| 2459E1831723H.xml | 282403 | modele=1/version=2.3 | 44.0, 43.0, 43.2, 43.5, 42.8 |
| 2535E0426429Q.xml | 282472 | modele=1/version=2.4 | 208.1, 208.0, 214.3, 209.8, 206.5 |

## Notes

- Fixtures are the real DPE XML corpus checked in at packages/open3cl-adapter/test/fixtures/ (from the Open3CL engine clone corpus); no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join the corpus after privacy review.
- Parsing is bounded (5 MB cap), not streaming; see TR-P1-03 note in docs/phases/P1-dpe-import.md.
