/**
 * Runtime configuration of the API, read from environment variables
 * (see .env.example). No secrets are hardcoded.
 */
export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly corsOrigin: string;
  readonly maxUploadBytes: number;
  readonly migrationsDir: string;
}

/**
 * Injection token for ApiConfig.
 */
export const CONFIG = Symbol('ApiConfig');

/**
 * Loads the API configuration from the environment with local-dev defaults.
 *
 * `DATABASE_URL=memory://` selects the in-memory repository (local demos and
 * e2e tests without Docker); any other value is a Postgres connection string.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env['API_PORT'] ?? 3000);
  const maxUploadBytes = Number(env['MAX_UPLOAD_BYTES'] ?? 5 * 1024 * 1024);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`API_PORT must be a positive integer, got ${String(env['API_PORT'])}`);
  }
  if (!Number.isInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new Error(`MAX_UPLOAD_BYTES must be a positive integer, got ${String(env['MAX_UPLOAD_BYTES'])}`);
  }
  return {
    port,
    databaseUrl: env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/hecs',
    corsOrigin: env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    maxUploadBytes,
    migrationsDir: env['MIGRATIONS_DIR'] ?? 'infrastructure/postgres/migrations'
  };
}
