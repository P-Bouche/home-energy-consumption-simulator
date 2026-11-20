/**
 * Minimal logger abstraction used by the application layer so use cases stay
 * framework-free (no NestJS Logger import) and tests can capture output.
 */
export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Default logger writing to the console.
 */
export const consoleLogger: Logger = {
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message)
};
