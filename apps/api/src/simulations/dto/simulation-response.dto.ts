import { ApiProperty } from '@nestjs/swagger';
import type {
  SimulationJob,
  SimulationJobError,
  SimulationResultRecord
} from '@hes/domain';

/**
 * Response DTO of a persisted simulation result (P2). Adds the per-m²
 * figures (kWh/m².an, kg CO₂/m².an) read from the raw engine output for
 * display — the domain SimulationResult keeps the totals.
 */
export class SimulationResultResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ description: 'sha256 of the canonical building input (cache key)', type: String }) inputHash!: string;
  @ApiProperty({ description: 'pinned engine version that produced the result', type: String }) engineVersion!: string;
  @ApiProperty({ description: 'ISO-8601 creation timestamp', type: String }) createdAt!: string;
  @ApiProperty({ description: 'primary-energy consumption, 5 regulated usages (kWh)', type: Number }) consumptionKwh!: number;
  @ApiProperty({ description: 'primary-energy consumption per m² (kWh/m².an)', type: Number, nullable: true }) consumptionKwhM2An!: number | null;
  @ApiProperty({ description: 'GHG emissions, 5 regulated usages (kg CO2e)', type: Number }) emissionsKg!: number;
  @ApiProperty({ description: 'GHG emissions per m² (kg CO2e/m².an)', type: Number, nullable: true }) emissionsKgCo2M2An!: number | null;
  @ApiProperty({ enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], description: 'DPE energy label' }) energyLabel!: string;
  @ApiProperty({ enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], description: 'DPE climate (GES) label' }) climateLabel!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'verbatim raw engine output (audit)' }) rawEngineOutput!: Record<string, unknown>;
}

/**
 * Response DTO of a simulation job (status polling, TR-P2-04).
 */
export class SimulationJobResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ type: String }) inputHash!: string;
  @ApiProperty({ enum: ['queued', 'running', 'done', 'failed'] }) status!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) resultId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true, description: '{ code, message } when status = failed' })
  error!: SimulationJobError | null;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) finishedAt!: string | null;
}

/**
 * Response of POST /buildings/:id/simulations: `result` on the sync/cached
 * paths (201), `job` on the queued path (202).
 */
export class RunSimulationResponseDto {
  @ApiProperty({ enum: ['sync', 'cached', 'async'], description: "'sync' = computed now (201), 'cached' = served from the input-hash cache (201, engine not called), 'async' = queued job (202)" })
  mode!: 'sync' | 'cached' | 'async';
  @ApiProperty({ type: Boolean, description: 'true when the result was served from cache (engine call counter unchanged)'})
  cached!: boolean;
  @ApiProperty({ type: SimulationResultResponseDto, required: false }) result?: SimulationResultResponseDto;
  @ApiProperty({ type: SimulationJobResponseDto, required: false }) job?: SimulationJobResponseDto;
}

/**
 * Response of GET /buildings/:id/simulations (history, most recent first).
 */
export class SimulationHistoryResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) buildingId!: string;
  @ApiProperty({ type: [SimulationResultResponseDto] }) results!: SimulationResultResponseDto[];
}

function readPerM2(record: SimulationResultRecord, section: 'ep_conso' | 'emission_ges', field: string): number | null {
  const raw = record.rawEngineOutput as Record<string, unknown>;
  const logement = raw['logement'] as Record<string, unknown> | undefined;
  const sortie = logement?.['sortie'] as Record<string, unknown> | undefined;
  const group = sortie?.[section] as Record<string, unknown> | undefined;
  const value = group?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Maps a domain SimulationResultRecord to its API response DTO.
 */
export function toSimulationResultDto(record: SimulationResultRecord): SimulationResultResponseDto {
  return {
    id: record.id,
    buildingId: record.buildingId,
    inputHash: record.inputHash,
    engineVersion: record.engineVersion,
    createdAt: record.createdAt.toISOString(),
    consumptionKwh: record.consumptionKwh,
    consumptionKwhM2An: readPerM2(record, 'ep_conso', 'ep_conso_5_usages_m2'),
    emissionsKg: record.emissionsKg,
    emissionsKgCo2M2An: readPerM2(record, 'emission_ges', 'emission_ges_5_usages_m2'),
    energyLabel: record.energyLabel,
    climateLabel: record.climateLabel,
    rawEngineOutput: record.rawEngineOutput
  };
}

/**
 * Maps a domain SimulationJob to its API response DTO.
 */
export function toSimulationJobDto(job: SimulationJob): SimulationJobResponseDto {
  return {
    id: job.id,
    buildingId: job.buildingId,
    inputHash: job.inputHash,
    status: job.status,
    resultId: job.resultId,
    error: job.error === null ? null : { ...job.error },
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt === null ? null : job.startedAt.toISOString(),
    finishedAt: job.finishedAt === null ? null : job.finishedAt.toISOString()
  };
}
