import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  GET_SIMULATION_JOB_USE_CASE,
  GET_SIMULATION_USE_CASE,
  GetSimulationJobUseCase,
  GetSimulationUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { SimulationJobResponseDto, SimulationResultResponseDto, toSimulationJobDto, toSimulationResultDto } from './dto/simulation-response.dto.ts';

/**
 * Thin controller for reading persisted simulation results and jobs:
 * GET /simulations/:id and GET /simulations/jobs/:id (status polling).
 */
@ApiTags('simulations')
@Controller('simulations')
export class SimulationsController {
  private readonly getSimulation: GetSimulationUseCase;
  private readonly getJob: GetSimulationJobUseCase;

  constructor(
    @Inject(GET_SIMULATION_USE_CASE) getSimulation: GetSimulationUseCase,
    @Inject(GET_SIMULATION_JOB_USE_CASE) getJob: GetSimulationJobUseCase
  ) {
    this.getSimulation = getSimulation;
    this.getJob = getJob;
  }

  /**
   * Job status polling (TR-P2-04). Declared before `:id` so `jobs/...` is not
   * captured by the `:id` route.
   *
   * @returns the job (200) with status queued | running | done | failed
   * @throws 404 when the job id is unknown
   */
  @Get('jobs/:id')
  @ApiOperation({ summary: 'Poll a simulation job status (queued/running/done/failed)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'the simulation job', type: SimulationJobResponseDto })
  @ApiResponse({ status: 404, description: 'unknown job id', type: ErrorResponseDto })
  async getJobById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<SimulationJobResponseDto> {
    const job = await this.getJob.execute(id);
    return toSimulationJobDto(job);
  }

  /**
   * @returns one persisted simulation result (200)
   * @throws 404 when the id is unknown
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a persisted simulation result by id' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'the simulation result', type: SimulationResultResponseDto })
  @ApiResponse({ status: 404, description: 'unknown simulation id', type: ErrorResponseDto })
  async getSimulationById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ): Promise<SimulationResultResponseDto> {
    const record = await this.getSimulation.execute(id);
    return toSimulationResultDto(record);
  }
}
