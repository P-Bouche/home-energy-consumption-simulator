# P3 Geometry Reconstruction Benchmark Report

- Date: 2026-11-20
- Machine: INTEL(R) XEON(R) PLATINUM 8581C CPU @ 2.30GHz, 5 vCPU @ 0 GHz, 5.9 GB RAM, linux x64
- Node: v24.14.1 (budget measured on the .nvmrc runtime in CI)
- Corpus: 15 DPE fixtures (packages/open3cl-adapter/test/fixtures), imported by the P1 importer, then reconstructed
- Pipeline per sample: import is excluded; measured = ReconstructionService.reconstruct + geometryToJson + geometryToMeshBuffers (the work of GET /buildings/:id/geometry)
- Samples: 5 runs per fixture after 1 warm-up (75 timed runs)
- Percentiles: nearest-rank; budget p95 < 2000 ms (AC-P3-01 / TR-P3-01)

## Results

| Metric | Value |
| --- | --- |
| p50 | 0.18 ms |
| p95 | 0.93 ms |
| max | 2.36 ms |
| mean | 0.27 ms |

**AC-P3-01 (p95 < 2000 ms): PASS**

## Per-fixture

| Fixture | XML bytes | elements | vertices | mesh hash | min ms | max ms |
| --- | --- | --- | --- | --- | --- | --- |
| 2238E0097309E.xml | 38939 | 10 | 60 | 4a4c631dfcae5e4f | 0.15 | 0.70 |
| 2260E1364581G.xml | 36110 | 8 | 48 | f1ee0ec8af1f1498 | 0.10 | 0.19 |
| 2262E0170610J.xml | 37935 | 9 | 54 | 4e895c4520910276 | 0.10 | 0.42 |
| 2287E1201982M.xml | 114349 | 15 | 90 | cfd98992c2fd16f7 | 0.16 | 0.21 |
| 2292E0764683M.xml | 91337 | 9 | 54 | 849768f128b5fd2c | 0.09 | 0.18 |
| 2313E0178624T.xml | 34802 | 7 | 42 | fc1f80ae564af570 | 0.05 | 0.09 |
| 2321E3872263C.xml | 537771 | 88 | 528 | d3c3a159b4579647 | 0.92 | 2.36 |
| 2337E2210396T.xml | 68617 | 15 | 90 | 3c6749e5fcf3e19e | 0.08 | 0.20 |
| 2364E0984413P.xml | 310457 | 33 | 198 | 5117be6186bc32f4 | 0.18 | 0.23 |
| 2368E1266847P.xml | 291250 | 41 | 246 | 3d32b3b74626f3be | 0.27 | 0.52 |
| 2374E2700849T.xml | 280916 | 33 | 198 | 7d7a41aacd287227 | 0.18 | 0.24 |
| 2375E2236932V.xml | 39023 | 7 | 42 | d98291d67c2e5a2d | 0.03 | 0.06 |
| 2387E0888781I.xml | 156092 | 16 | 96 | 646ca2ae80bfad68 | 0.07 | 0.12 |
| 2459E1831723H.xml | 282403 | 22 | 132 | 8ad52bde06f309a0 | 0.11 | 0.17 |
| 2535E0426429Q.xml | 282472 | 87 | 522 | fd42a3afc85491fe | 0.42 | 0.49 |

## Notes

- Reconstruction is pure CPU over small inputs (a dwelling ≤ 300 m² has tens of elements); the budget has orders of magnitude of headroom on the reference machine.
- Geometry is deterministic: the mesh hash per fixture is stable across runs (asserted in unit tests: same building → same hash).
