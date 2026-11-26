# P3 Geometry Reconstruction Benchmark Report

- Date: 2026-11-26
- Machine: AMD Ryzen 5 5600X 6-Core Processor, 12 vCPU @ 0 GHz, 15.6 GB RAM, linux x64
- Node: v26.13.1 (actual runtime of this run; the p95 < 2000 ms budget is defined against the .nvmrc runtime, Node 24.14.1, in CI)
- Corpus: 15 DPE fixtures (packages/open3cl-adapter/test/fixtures), imported by the P1 importer, then reconstructed
- Pipeline per sample: import is excluded; measured = ReconstructionService.reconstruct + geometryToJson + geometryToMeshBuffers (the work of GET /buildings/:id/geometry)
- Samples: 5 runs per fixture after 1 warm-up (75 timed runs)
- Percentiles: nearest-rank; budget p95 < 2000 ms (AC-P3-01 / TR-P3-01)

## Results

| Metric | Value |
| --- | --- |
| p50 | 0.34 ms |
| p95 | 1.05 ms |
| max | 1.30 ms |
| mean | 0.40 ms |

**AC-P3-01 (p95 < 2000 ms): PASS**

## Per-fixture

| Fixture | XML bytes | elements | vertices | mesh hash | min ms | max ms |
| --- | --- | --- | --- | --- | --- | --- |
| 2238E0097309E.xml | 38936 | 10 | 270 | 2eb52cb8789a2e2e | 0.34 | 1.10 |
| 2260E1364581G.xml | 36110 | 8 | 204 | dda1495171a25c46 | 0.22 | 0.53 |
| 2262E0170610J.xml | 37932 | 12 | 234 | 5180ca4df1b4b5a0 | 0.22 | 0.54 |
| 2287E1201982M.xml | 114346 | 15 | 330 | 67233254633979d2 | 0.36 | 0.47 |
| 2292E0764683M.xml | 91334 | 9 | 204 | 0b6ef5054864331e | 0.12 | 0.14 |
| 2313E0178624T.xml | 34802 | 7 | 120 | 88ad11e5205b40f9 | 0.09 | 0.31 |
| 2321E3872263C.xml | 537771 | 88 | 1614 | a45710237c493db2 | 0.88 | 1.28 |
| 2337E2210396T.xml | 68614 | 15 | 414 | d446e326f5f2601c | 0.20 | 0.32 |
| 2364E0984413P.xml | 310457 | 35 | 738 | 5f79b96e39b6ef2c | 0.37 | 0.47 |
| 2368E1266847P.xml | 291250 | 41 | 936 | 122007a66eb508be | 0.47 | 0.81 |
| 2374E2700849T.xml | 280916 | 35 | 870 | 253f347f892bef07 | 0.37 | 0.41 |
| 2375E2236932V.xml | 39023 | 7 | 120 | 98c63e3fe428e409 | 0.06 | 0.11 |
| 2387E0888781I.xml | 156089 | 17 | 336 | fc0c48c0dea343cd | 0.15 | 0.18 |
| 2459E1831723H.xml | 282403 | 22 | 438 | 088b100b74921de6 | 0.20 | 0.27 |
| 2535E0426429Q.xml | 282472 | 87 | 2184 | eeabc61bdc31be79 | 0.87 | 1.30 |

## Notes

- Reconstruction is pure CPU over small inputs (a dwelling ≤ 300 m² has tens of elements); the budget has orders of magnitude of headroom on the reference machine.
- Geometry is deterministic: the mesh hash per fixture is stable across runs (asserted in unit tests: same building → same hash).
