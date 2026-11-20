-- Schema v1 — Home Energy Consumption Simulator (P1)
-- Applied by packages/postgres-repository (runMigrations); tracked in
-- schema_migrations. PostGIS is enabled now for future geo features (P3+);
-- v1 stores the BAN geolocation as a Lambert-93 (EPSG:2154) point.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- The Building aggregate is persisted as a JSONB document (domain
-- BuildingJson shape: every value wrapped in { value, source, confidence,
-- importDate }). One row per imported building.
CREATE TABLE IF NOT EXISTS buildings (
  id             uuid PRIMARY KEY,
  dpe_number     text,
  schema_variant text NOT NULL,
  location       geometry(Point, 2154), -- BAN ban_x / ban_y (Lambert-93), NULL when absent
  created_at     timestamptz NOT NULL DEFAULT now(),
  data           jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS buildings_dpe_number_idx ON buildings (dpe_number);
CREATE INDEX IF NOT EXISTS buildings_location_idx ON buildings USING GIST (location);

-- Import report v1 (reportVersion = 1), one per building, stored verbatim.
CREATE TABLE IF NOT EXISTS import_reports (
  building_id    uuid PRIMARY KEY REFERENCES buildings (id) ON DELETE CASCADE,
  report_version integer NOT NULL,
  report         jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
