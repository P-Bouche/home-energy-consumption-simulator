-- Schema v4 — Home Energy Consumption Simulator (P5: scenario management)
-- Applied by packages/postgres-repository (runMigrations); tracked in
-- schema_migrations. Builds on v1 (buildings, import_reports), v2
-- (simulations, simulation_jobs) and v3 (buildings.version + append-only
-- audit_entries, P4 — buildings.version semantics are NOT touched here:
-- 0 at import, +1 per applied command).

-- Renovation scenarios (P5): a named, declarative change-set of versioned
-- commands (JSONB with the frozen P4 vocabulary type tags,
-- building.<element>.update.v1) applied to a fork of the building via
-- Building.fork. baseline_version records the building aggregate version at
-- creation (informational; staleness of linked results is detected by
-- input-hash verification at compare time, not by this column).
CREATE TABLE IF NOT EXISTS scenarios (
  id               uuid PRIMARY KEY,
  building_id      uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  commands         jsonb NOT NULL,          -- BuildingCommand[] (frozen P4 vocabulary tags)
  baseline_version integer NOT NULL CHECK (baseline_version >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenarios_building_id_idx ON scenarios (building_id, created_at ASC);

-- Per-scenario simulation results (P5): links a scenario to a persisted
-- simulation result (simulations table, schema v2 — the shared input-hash
-- cache). Deleting a scenario removes only its links (FR-P5-06), never the
-- building or the simulation results.
CREATE TABLE IF NOT EXISTS scenario_results (
  id            uuid PRIMARY KEY,
  scenario_id   uuid NOT NULL REFERENCES scenarios (id) ON DELETE CASCADE,
  simulation_id uuid NOT NULL REFERENCES simulations (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, simulation_id)
);

CREATE INDEX IF NOT EXISTS scenario_results_scenario_id_idx ON scenario_results (scenario_id, created_at DESC);
