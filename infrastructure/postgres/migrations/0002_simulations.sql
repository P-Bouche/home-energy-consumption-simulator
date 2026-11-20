-- Schema v2 — Home Energy Consumption Simulator (P2: energy simulation)
-- Applied by packages/postgres-repository (runMigrations); tracked in
-- schema_migrations. Builds on v1 (buildings, import_reports).
--
-- The Building aggregate keeps its verbatim source DPE XML in buildings.data
-- (BuildingJson.sourceDpeXml), so no v1 column change is needed here.

-- Persisted simulation results (P2). One row per (building, input hash):
-- the UNIQUE constraint is the result cache (FR-P2-03 / TR-P2-05) —
-- re-simulating an unchanged building is a lookup, not an engine re-run.
CREATE TABLE IF NOT EXISTS simulations (
  id             uuid PRIMARY KEY,
  building_id    uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  input_hash     text NOT NULL,               -- sha256 of the canonical BuildingJson
  engine_version text NOT NULL,               -- pinned engine version that produced the result
  status         text NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'failed')),
  result         jsonb NOT NULL,              -- SimulationResultRecordJson (raw engine output kept verbatim)
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, input_hash)
);

CREATE INDEX IF NOT EXISTS simulations_building_id_idx ON simulations (building_id, created_at DESC);

-- Asynchronous simulation jobs (TR-P2-04). The partial unique index lets at
-- most one in-flight job per (building, input_hash) — duplicate requests get
-- HTTP 409 with the existing job id.
CREATE TABLE IF NOT EXISTS simulation_jobs (
  id          uuid PRIMARY KEY,
  building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  input_hash  text NOT NULL,
  status      text NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  result_id   uuid REFERENCES simulations (id) ON DELETE SET NULL,
  error       jsonb,                          -- { code, message } when status = 'failed'
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS simulation_jobs_active_hash_idx
  ON simulation_jobs (building_id, input_hash)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS simulation_jobs_building_id_idx ON simulation_jobs (building_id, created_at DESC);
