import { Building, importReportFromJson, type BuildingId, type ImportReport } from '@hes/domain';
import type { BuildingRepository, SaveBuildingInput, StoredBuilding } from '@hes/application';
import type { Pool, PoolClient } from 'pg';

/**
 * Rolls back the current transaction without masking the original error:
 * when the connection already died, `ROLLBACK` itself throws, and that
 * secondary failure is attached to the original error instead of replacing
 * it.
 */
async function rollbackQuietly(client: PoolClient, originalError: unknown): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    if (originalError instanceof Error) {
      (originalError as Error & { rollbackError?: unknown }).rollbackError = rollbackError;
    }
  }
}

/**
 * Postgres adapter for the BuildingRepository port (no ORM — the domain
 * aggregate is persisted as a JSONB document in its BuildingJson shape).
 *
 * Schema v1 (infrastructure/postgres/migrations/0001_init.sql):
 * - buildings(id uuid PK, dpe_number, schema_variant, location geometry(Point, 2154), data jsonb)
 * - import_reports(building_id PK/FK, report_version, report jsonb)
 */
export class PostgresBuildingRepository implements BuildingRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Persists the aggregate and its import report in a single transaction.
   *
   * @throws when the database write fails (transaction is rolled back and
   * the error is rethrown — never swallowed)
   */
  async save(input: SaveBuildingInput): Promise<BuildingId> {
    const { building, report } = input;
    const json = building.toJson();
    const reportJson = {
      reportVersion: report.reportVersion,
      dpeNumber: report.dpeNumber,
      schemaVariant: report.schemaVariant,
      generatedAt: report.generatedAt.toISOString(),
      parsedFields: report.parsedFields,
      inferredFields: report.inferredFields,
      unrecognizedFields: report.unrecognizedFields,
      missingFields: report.missingFields
    };
    const banX = json.banCoordinates?.x.value ?? null;
    const banY = json.banCoordinates?.y.value ?? null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO buildings (id, dpe_number, schema_variant, location, data)
         VALUES ($1, $2, $3,
                 CASE WHEN $4::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 2154) END,
                 $6)`,
        [building.id, json.dpeNumber?.value ?? null, report.schemaVariant, banX, banY, JSON.stringify(json)]
      );
      await client.query(
        'INSERT INTO import_reports (building_id, report_version, report) VALUES ($1, $2, $3)',
        [building.id, report.reportVersion, JSON.stringify(reportJson)]
      );
      await client.query('COMMIT');
      return building.id;
    } catch (error) {
      await rollbackQuietly(client, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Loads the aggregate and report by id; null when unknown.
   */
  async findById(id: BuildingId): Promise<StoredBuilding | null> {
    const result = await this.pool.query(
      `SELECT b.data AS building, r.report AS report
       FROM buildings b
       JOIN import_reports r ON r.building_id = b.id
       WHERE b.id = $1`,
      [id]
    );
    const row = result.rows[0] as { building: unknown; report: unknown } | undefined;
    if (row === undefined) {
      return null;
    }
    const building = Building.fromJson(row.building as Parameters<typeof Building.fromJson>[0]);
    const report = importReportFromJson(row.report as Parameters<typeof importReportFromJson>[0]);
    return { building, report: report as ImportReport };
  }
}
