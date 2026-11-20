-- Schema v3 — Home Energy Consumption Simulator (P4: building editor)
-- Applied by packages/postgres-repository (runMigrations); tracked in
-- schema_migrations. Builds on v1 (buildings, import_reports) and v2
-- (simulations, simulation_jobs).

-- Optimistic-locking version of the Building aggregate (P4, TR-P4-02).
-- 0 for buildings imported before v3; +1 on every applied edit command.
-- The version is NOT duplicated inside buildings.data (the JSONB document):
-- the column is the single source of truth used by the conditional UPDATE.
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0 CHECK (version >= 0);

-- Append-only audit log of every building edit (P4, FR-P4-03 / TR-P4-03).
-- One row per applied command: who / when / which command / old→new values /
-- resulting aggregate version. Append-only is enforced at DB level by the
-- triggers below: UPDATE, DELETE and TRUNCATE are rejected.
CREATE TABLE IF NOT EXISTS audit_entries (
  id           uuid PRIMARY KEY,
  building_id  uuid NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  command_type text NOT NULL,
  command      jsonb NOT NULL,   -- versioned BuildingCommand JSON (vocabulary v1)
  changes      jsonb NOT NULL,   -- [{ field, oldValue, newValue }] with Confidence JSON values
  version      integer NOT NULL CHECK (version >= 1),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_entries_building_id_idx ON audit_entries (building_id, created_at ASC, id ASC);

-- Append-only enforcement (DB level): any mutation of an audit row fails.
CREATE OR REPLACE FUNCTION audit_entries_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

DROP TRIGGER IF EXISTS audit_entries_no_row_mutation ON audit_entries;
CREATE TRIGGER audit_entries_no_row_mutation
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_entries_append_only();

DROP TRIGGER IF EXISTS audit_entries_no_truncate ON audit_entries;
CREATE TRIGGER audit_entries_no_truncate
  BEFORE TRUNCATE ON audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION audit_entries_append_only();
