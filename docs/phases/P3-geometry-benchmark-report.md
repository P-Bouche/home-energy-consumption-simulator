# P3 Geometry Reconstruction Benchmark Report

- Date: 2026-11-26
- Machine: AMD Ryzen 5 5600X 6-Core Processor, 12 vCPU @ 0 GHz, 15.6 GB RAM, linux x64
- Node: v26.13.1 (budget measured on the .nvmrc runtime in CI)
- Corpus: 15 DPE fixtures (packages/open3cl-adapter/test/fixtures), imported by the P1 importer, then reconstructed
- Pipeline per sample: import is excluded; measured = ReconstructionService.reconstruct + geometryToJson + geometryToMeshBuffers (the work of GET /buildings/:id/geometry)
- Samples: 5 runs per fixture after 1 warm-up (75 timed runs)
- Percentiles: nearest-rank; budget p95 < 2000 ms (AC-P3-01 / TR-P3-01)

## Results

| Metric | Value |
| --- | --- |
| p50 | 0.31 ms |
| p95 | 1.37 ms |
| max | 1.63 ms |
| mean | 0.47 ms |

**AC-P3-01 (p95 < 2000 ms): PASS**

## Per-fixture

| Fixture | XML bytes | elements | vertices | mesh hash | min ms | max ms |
| --- | --- | --- | --- | --- | --- | --- |
| 2238E0097309E.xml | 38936 | 13 | 342 | 6c0948cb8fcd9b1e | 0.37 | 1.37 |
| 2260E1364581G.xml | 36110 | 11 | 240 | 8c55d8c3dbb8ea58 | 0.27 | 0.62 |
| 2262E0170610J.xml | 37932 | 15 | 378 | bd01016da6269e84 | 0.21 | 0.31 |
| 2287E1201982M.xml | 114346 | 16 | 360 | e7ab06598d22bf4a | 0.21 | 0.24 |
| 2292E0764683M.xml | 91334 | 12 | 246 | d87eb482f2246ffb | 0.29 | 0.47 |
| 2313E0178624T.xml | 34802 | 10 | 150 | 4280e2ad705adb18 | 0.11 | 0.17 |
| 2321E3872263C.xml | 537771 | 89 | 1920 | f56f6183d8fcb2db | 1.07 | 1.58 |
| 2337E2210396T.xml | 68614 | 16 | 438 | 6be96060a8c2e199 | 0.21 | 0.27 |
| 2364E0984413P.xml | 310457 | 36 | 888 | d2d6abed6e64e175 | 0.41 | 0.48 |
| 2368E1266847P.xml | 291250 | 42 | 1080 | 5f961149a8704c4d | 0.58 | 0.90 |
| 2374E2700849T.xml | 280916 | 36 | 1218 | 1ee29079d392a006 | 0.49 | 0.57 |
| 2375E2236932V.xml | 39023 | 10 | 150 | 6f74a6095d3818a2 | 0.09 | 0.13 |
| 2387E0888781I.xml | 156089 | 18 | 402 | 977e0db215830e2a | 0.19 | 0.25 |
| 2459E1831723H.xml | 282403 | 23 | 558 | 46f7f54df5050621 | 0.26 | 0.32 |
| 2535E0426429Q.xml | 282472 | 88 | 3258 | 89578f1bc464ca5a | 1.18 | 1.63 |

## Notes

- Reconstruction is pure CPU over small inputs (a dwelling ≤ 300 m² has tens of elements); the budget has orders of magnitude of headroom on the reference machine.
- Geometry is deterministic: the mesh hash per fixture is stable across runs (asserted in unit tests: same building → same hash).
