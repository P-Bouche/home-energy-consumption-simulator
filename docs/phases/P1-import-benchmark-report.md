# P1 Import Benchmark Report — DPE XML Import Latency

Generated: 2026-11-20T11:03:55.976Z

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
| min | 3.6 |
| p50 | 17.9 |
| p95 | 300.8 |
| max | 334.5 |
| mean | 60.0 |

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
| 2238E0097309E.xml | 38939 | modele=1/version=2 | 6.9, 7.6, 6.3, 6.7, 5.8 |
| 2260E1364581G.xml | 36110 | modele=1/version=2.1 | 5.0, 5.4, 5.5, 5.7, 6.3 |
| 2262E0170610J.xml | 37935 | modele=1/version=2 | 5.4, 5.9, 6.9, 7.1, 5.1 |
| 2287E1201982M.xml | 114349 | modele=1/version=2.1 | 19.4, 17.9, 17.7, 17.4, 17.9 |
| 2292E0764683M.xml | 91337 | modele=1/version=2 | 11.0, 11.4, 14.4, 15.1, 15.2 |
| 2313E0178624T.xml | 34802 | modele=1/version=2.2 | 4.8, 4.5, 3.9, 4.0, 4.6 |
| 2321E3872263C.xml | 537771 | modele=1/version=2.3 | 334.5, 323.6, 302.0, 300.8, 298.2 |
| 2337E2210396T.xml | 68617 | modele=1/version=2.3 | 11.2, 11.2, 11.2, 11.0, 11.5 |
| 2364E0984413P.xml | 310457 | modele=1/version=2.2 | 72.3, 72.7, 73.6, 81.8, 77.9 |
| 2368E1266847P.xml | 291250 | modele=1/version=2.2 | 90.1, 84.7, 80.9, 88.2, 80.9 |
| 2374E2700849T.xml | 280916 | modele=1/version=2.3 | 76.3, 77.0, 71.7, 72.1, 71.7 |
| 2375E2236932V.xml | 39023 | modele=1/version=2.3 | 3.8, 3.7, 4.1, 3.8, 3.6 |
| 2387E0888781I.xml | 156092 | modele=1/version=2.2 | 22.3, 22.2, 22.7, 22.9, 22.4 |
| 2459E1831723H.xml | 282403 | modele=1/version=2.3 | 55.3, 52.6, 47.1, 45.0, 42.8 |
| 2535E0426429Q.xml | 282472 | modele=1/version=2.4 | 222.3, 217.7, 210.1, 208.2, 208.2 |

## Notes

- Fixtures are the real DPE XML corpus checked in at packages/open3cl-adapter/test/fixtures/ (from the Open3CL engine clone corpus); no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join the corpus after privacy review.
- Parsing is bounded (5 MB cap), not streaming; see TR-P1-03 note in docs/phases/P1-dpe-import.md.
