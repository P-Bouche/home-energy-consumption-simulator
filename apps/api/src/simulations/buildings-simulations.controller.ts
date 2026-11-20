import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  GET_SIMULATION_HISTORY_USE_CASE,
  RUN_SIMULATION_USE_CASE,
  GetSimulationHistoryUseCase,
  RunSimulationUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import {
  RunSimulationResponseDto,
  SimulationHistoryResponseDto,
  toSimulationJobDto,
  toSimulationResultDto
} from './dto/simulation-response.dto.ts';

/**
 * Thin controller for the P2 simulation endpoints on a building:
 * POST /buildings/:id/simulations (run — sync 201, cached 201, queued 202)
 * and GET /buildings/:id/simulations (history).
 */
@ApiTags('buildings')
@Controller('buildings')
export class BuildingsSimulationsController {
  private readonly runSimulation: RunSimulationUseCase;
  private readonly getHistory: GetSimulationHistoryUseCase;

  constructor(
    @Inject(RUN_SIMULATION_USE_CASE) runSimulation: RunSimulationUseCase,
    @Inject(GET_SIMULATION_HISTORY_USE_CASE) getHistory: GetSimulationHistoryUseCase
  ) {
    this.runSimulation = runSimulation;
    this.getHistory = getHistory;
  }

  /**
   * Runs an Open3CL simulation on the current state of the building (FR-P2-01).
   *
   * - 201 + result when computed now or served from the input-hash cache
   *   (`cached: true`, engine not called — FR-P2-03 / AC-P2-04)
   * - 202 + job when the run is queued (poll GET /simulations/jobs/:id)
   * - 404 unknown building · 409 identical input hash already in flight
   *   · 422 mapping error · 500 engine error
   */
  @Post(':id/simulations')
  @ApiOperation({ summary: 'Run an Open3CL simulation on the building (sync 201 / cached 201 / queued 202)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'simulation computed now or served from cache', type: RunSimulationResponseDto })
  @ApiResponse({ status: 202, description: 'simulation queued as a job (poll GET /simulations/jobs/:id)', type: RunSimulationResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'identical input hash already in flight (body carries jobId)', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'mapping error (building cannot be mapped to an engine input / engine output)', type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: 'engine error', type: ErrorResponseDto })
  async runSimulationOnBuilding(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<RunSimulationResponseDto> {
    const outcome = await this.runSimulation.execute(id);
    if (outcome.kind === 'queued') {
      response.status(202);
      return { mode: 'async', cached: false, job: toSimulationJobDto(outcome.job) };
    }
    return {
      mode: outcome.kind === 'cached' ? 'cached' : 'sync',
      cached: outcome.kind === 'cached',
      result: toSimulationResultDto(outcome.record)
    };
  }

  /**
   * @returns the historized simulation results of the building, most recent first (FR-P2-02)
   * @throws 404 unknown building
   */
  @Get(':id/simulations')
  @ApiOperation({ summary: 'List the simulation history of a building (most recent first)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'simulation history', type: SimulationHistoryResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async getSimulationHistory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ): Promise<SimulationHistoryResponseDto> {
    const { buildingId, results } = await this.getHistory.execute(id);
    return { buildingId, results: results.map(toSimulationResultDto) };
  }
}
