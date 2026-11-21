import {
  assertCommandFieldsValid,
  CommandValidationError,
  InvalidCommandError,
  parseBuildingCommand,
  type Building,
  type BuildingCommand,
  type BuildingId,
  type CommandError
} from '@hes/domain';

/**
 * Shared helpers of the P5 scenario use cases: untrusted command JSON →
 * validated {@link BuildingCommand}s (frozen P4 vocabulary), and validation of
 * a change-set against a building via `Building.fork` (the same pure path the
 * apply flow uses).
 */

/**
 * Identity stamped on scenario forks/applies for audit provenance when the
 * caller does not provide one (the API boundary passes `x-user-id`).
 */
export const SCENARIO_USER_ID = 'scenario';

/**
 * Parses and field-validates a list of untrusted command JSON values into
 * {@link BuildingCommand}s. When `buildingId` is given (the API knows the
 * target building from the URL), it is stamped onto every command that does
 * not carry one; a command carrying a DIFFERENT buildingId is left as-is and
 * rejected later by the fork validation (400).
 *
 * @throws InvalidCommandError when a command is not in the frozen vocabulary
 * @throws CommandValidationError when a command violates a domain range
 */
export function parseScenarioCommands(json: unknown, buildingId?: BuildingId): BuildingCommand[] {
  if (!Array.isArray(json)) {
    throw new InvalidCommandError(['commands must be a JSON array']);
  }
  const commands: BuildingCommand[] = [];
  const issues: string[] = [];
  json.forEach((raw, index) => {
    const stamped =
      buildingId !== undefined &&
      typeof raw === 'object' &&
      raw !== null &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>)['buildingId'] === undefined
        ? { ...(raw as Record<string, unknown>), buildingId }
        : raw;
    const parsed = parseBuildingCommand(stamped);
    if (!parsed.ok) {
      issues.push(`commands[${index}]: ${parsed.error.message}`);
      return;
    }
    try {
      assertCommandFieldsValid(parsed.value);
      commands.push(parsed.value);
    } catch (error) {
      if (error instanceof CommandValidationError) {
        throw error; // field-range violations keep their own typed error (HTTP 400, field details)
      }
      issues.push(`commands[${index}]: ${(error as Error).message}`);
    }
  });
  if (issues.length > 0) {
    throw new InvalidCommandError(issues);
  }
  if (commands.length === 0) {
    throw new InvalidCommandError(['a scenario must carry at least one command']);
  }
  return commands;
}

/**
 * Validates a change-set against a building by forking it (pure). Also stamps
 * the command `buildingId`s to the target building when missing is not
 * allowed — the vocabulary requires `buildingId`, so callers must pass it.
 *
 * @returns the forked building state on success
 * @throws CommandError subclasses (400/404) on the first rejected command
 */
export function forkOrThrow(
  building: Building,
  commands: readonly BuildingCommand[],
  ctx: { readonly now: Date; readonly userId: string }
): Building {
  const forked = building.fork(commands, ctx);
  if (!forked.ok) {
    throw forked.error;
  }
  return forked.value;
}

export type { CommandError };
