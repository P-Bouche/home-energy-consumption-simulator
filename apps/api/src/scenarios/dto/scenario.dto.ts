import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuditEntryJson, BuildingCommand, Scenario, ScenarioComparison, ScenarioComparisonEntry } from '@hes/domain';
import type { ScenarioResultLink } from '@hes/application';
import { BUILDING_COMMAND_SCHEMA } from '../../buildings/dto/edit-building.dto.ts';
import { SimulationResultResponseDto, toSimulationResultDto } from '../../simulations/dto/simulation-response.dto.ts';

/**
 * OpenAPI schema of a scenario change-set: an array of P4 commands (the frozen
 * vocabulary, `building.<element>.update.v1` tags — see BUILDING_COMMAND_SCHEMA).
 */
export const COMMAND_LIST_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: BUILDING_COMMAND_SCHEMA,
  description: 'declarative change-set: one versioned command per element edit'
} as const;

/**
 * Body of POST /buildings/:id/scenarios. `commands` is raw JSON validated by
 * the domain parser (frozen P4 vocabulary) inside the use case — unknown tags,
 * unknown fields, unknown element ids and out-of-range values are rejected
 * there with typed errors (400/404).
 */
export class CreateScenarioDto {
  @ApiProperty({ type: String, description: 'scenario name', example: 'Isolation des murs' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, description: 'free-form description', example: 'Murs isolés par l’extérieur (U = 0,2 W/m².K)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty(COMMAND_LIST_SCHEMA)
  @IsArray()
  @ArrayNotEmpty()
  commands!: unknown[];
}

/**
 * Body of PATCH /scenarios/:id (all fields optional).
 */
export class UpdateScenarioDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional(COMMAND_LIST_SCHEMA) @IsOptional() @IsArray() @ArrayNotEmpty() commands?: unknown[];
}

/**
 * Body of POST /buildings/:id/compare (optional subset of scenarios).
 */
export class CompareScenariosDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'restrict the comparison to these scenario ids (default: all scenarios of the building)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  scenarioIds?: string[];
}

/**
 * Response DTO of a scenario (commands carry their frozen P4 type tags).
 */
export class ScenarioResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: 'array', items: BUILDING_COMMAND_SCHEMA, description: 'versioned command tags (frozen P4 vocabulary)' }) commands!: BuildingCommand[];
  @ApiProperty({ type: Number, description: 'building aggregate version the scenario was created against (informational)' }) baselineVersion!: number;
  @ApiProperty({ type: String }) createdAt!: string;
}

/**
 * Response DTO of GET /buildings/:id/scenarios.
 */
export class ScenarioListResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ type: [ScenarioResponseDto] }) scenarios!: ScenarioResponseDto[];
}

/**
 * Response DTO of POST /scenarios/:id/simulate.
 */
export class SimulateScenarioResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) scenarioId!: string;
  @ApiProperty({ enum: ['sync', 'cached'], description: "'sync' = computed now, 'cached' = served from the input-hash cache (engine not called)" })
  mode!: 'sync' | 'cached';
  @ApiProperty({ type: SimulationResultResponseDto }) result!: SimulationResultResponseDto;
}

/**
 * Response DTO of POST /scenarios/:id/apply.
 */
export class ApplyScenarioResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) scenarioId!: string;
  @ApiProperty({ type: Number, description: 'building version before apply' }) previousVersion!: number;
  @ApiProperty({ type: Number, description: 'building version after apply (+1 per applied command)' }) newVersion!: number;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'one audit entry per applied scenario command (P4 append-only audit)' })
  auditEntries!: AuditEntryJson[];
  @ApiProperty({ enum: ['sync', 'cached'] }) simulationMode!: 'sync' | 'cached';
  @ApiProperty({ type: SimulationResultResponseDto, description: 'baseline re-simulated on the applied state' }) simulation!: SimulationResultResponseDto;
}

/**
 * One row of the comparison table.
 */
export class ScenarioComparisonEntryDto {
  @ApiProperty({ type: String, format: 'uuid' }) scenarioId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number, description: 'building version the scenario was created against (informational)' }) baselineVersion!: number;
  @ApiProperty({ type: SimulationResultResponseDto }) result!: SimulationResultResponseDto;
  @ApiProperty({ type: Number, description: 'scenario − baseline consumption, kWh (negative = saved)' }) deltaKwh!: number;
  @ApiProperty({ type: Number, description: 'scenario − baseline emissions, kg CO2e (negative = avoided)' }) deltaKgCo2!: number;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true, description: '{ from, to } energy label change, null when unchanged' })
  energyLabelChange!: { from: string; to: string } | null;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true, description: '{ from, to } climate label change, null when unchanged' })
  climateLabelChange!: { from: string; to: string } | null;
  @ApiProperty({ type: Number, description: '1 = most kWh saved' }) rank!: number;
}

/**
 * Response DTO of POST /buildings/:id/compare.
 */
export class ScenarioComparisonResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ type: SimulationResultResponseDto, description: 'baseline (current building state) result' }) baseline!: SimulationResultResponseDto;
  @ApiProperty({ type: [ScenarioComparisonEntryDto], description: 'one entry per scenario, sorted by rank' }) entries!: ScenarioComparisonEntryDto[];
  @ApiProperty({ type: [String], format: 'uuid', description: 'scenarios (re-)simulated during this call because their linked result was missing or stale (hash verification)' })
  simulatedNow!: readonly string[];
  @ApiProperty({ type: String }) generatedAt!: string;
}

/**
 * Maps a domain Scenario to its API DTO.
 */
export function toScenarioDto(scenario: Scenario): ScenarioResponseDto {
  const json = scenario.toJson();
  return {
    id: json.id,
    buildingId: json.buildingId,
    name: json.name,
    description: json.description,
    commands: json.commands.map((command) => ({ ...command })),
    baselineVersion: json.baselineVersion,
    createdAt: json.createdAt
  };
}

/**
 * Maps a domain ScenarioComparison to its API DTO.
 */
export function toComparisonDto(
  comparison: ScenarioComparison,
  simulatedNow: readonly string[]
): ScenarioComparisonResponseDto {
  return {
    buildingId: comparison.buildingId,
    baseline: toSimulationResultDto(comparison.baseline),
    entries: comparison.entries.map(toComparisonEntryDto),
    simulatedNow,
    generatedAt: comparison.generatedAt.toISOString()
  };
}

function toComparisonEntryDto(entry: ScenarioComparisonEntry): ScenarioComparisonEntryDto {
  return {
    scenarioId: entry.scenarioId,
    name: entry.name,
    baselineVersion: entry.baselineVersion,
    result: toSimulationResultDto(entry.result),
    deltaKwh: entry.deltaKwh,
    deltaKgCo2: entry.deltaKgCo2,
    energyLabelChange: entry.energyLabelChange,
    climateLabelChange: entry.climateLabelChange,
    rank: entry.rank
  };
}

/**
 * Link DTO (per-scenario result history).
 */
export class ScenarioResultLinkDto {
  @ApiProperty({ type: String, format: 'uuid' }) scenarioId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) simulationId!: string;
  @ApiProperty({ type: String }) createdAt!: string;
}

export function toLinkDto(link: ScenarioResultLink): ScenarioResultLinkDto {
  return { scenarioId: link.scenarioId, simulationId: link.simulationId, createdAt: link.createdAt.toISOString() };
}
