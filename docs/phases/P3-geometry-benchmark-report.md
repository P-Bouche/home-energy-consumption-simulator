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
| p50 | 0.15 ms |
| p95 | 1.72 ms |
| max | 2.01 ms |
| mean | 0.31 ms |

**AC-P3-01 (p95 < 2000 ms): PASS**

## Per-fixture

| Fixture | XML bytes | elements | vertices | mesh hash | min ms | max ms |
| --- | --- | --- | --- | --- | --- | --- |
| 2238E0097309E.xml | 38939 | 10 | 60 | 4ba0510555667bd9 | 0.15 | 0.73 |
| 2260E1364581G.xml | 36110 | 8 | 48 | f1bcb77189265d33 | 0.08 | 0.18 |
| 2262E0170610J.xml | 37935 | 9 | 54 | 80dd71c40a79e8d1 | 0.08 | 0.18 |
| 2287E1201982M.xml | 114349 | 15 | 90 | 6e5974dd7177253c | 0.14 | 1.88 |
| 2292E0764683M.xml | 91337 | 9 | 54 | dec1b3a8c936ebc4 | 0.09 | 0.15 |
| 2313E0178624T.xml | 34802 | 7 | 42 | fc1f80ae564af570 | 0.07 | 0.11 |
| 2321E3872263C.xml | 537771 | 88 | 528 | e4d62313bdf6e70c | 1.08 | 2.01 |
| 2337E2210396T.xml | 68617 | 15 | 90 | 3f0b30142753e3f8 | 0.12 | 0.21 |
| 2364E0984413P.xml | 310457 | 33 | 198 | 0930c115f86f3344 | 0.17 | 0.27 |
| 2368E1266847P.xml | 291250 | 41 | 246 | c1eb327f595135aa | 0.26 | 0.38 |
| 2374E2700849T.xml | 280916 | 33 | 198 | 7e937a69ad726700 | 0.14 | 0.18 |
| 2375E2236932V.xml | 39023 | 7 | 42 | d98291d67c2e5a2d | 0.03 | 0.08 |
| 2387E0888781I.xml | 156092 | 16 | 96 | 26c7181434bb8072 | 0.07 | 0.10 |
| 2459E1831723H.xml | 282403 | 22 | 132 | 07df40822931ab68 | 0.10 | 0.15 |
| 2535E0426429Q.xml | 282472 | 87 | 522 | 75eb089a856ec351 | 0.43 | 0.54 |

## Notes

- Reconstruction is pure CPU over small inputs (a dwelling ≤ 300 m² has tens of elements); the budget has orders of magnitude of headroom on the reference machine.
- Geometry is deterministic: the mesh hash per fixture is stable across runs (asserted in unit tests: same building → same hash).
