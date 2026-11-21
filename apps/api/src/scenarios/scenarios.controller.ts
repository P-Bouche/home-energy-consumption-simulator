import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { auditEntryToJson } from '@hes/domain';
import {
  APPLY_SCENARIO_USE_CASE,
  DELETE_SCENARIO_USE_CASE,
  GET_SCENARIO_USE_CASE,
  SIMULATE_SCENARIO_USE_CASE,
  UPDATE_SCENARIO_USE_CASE,
  ApplyScenarioUseCase,
  DeleteScenarioUseCase,
  GetScenarioUseCase,
  SimulateScenarioUseCase,
  UpdateScenarioUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { toSimulationResultDto } from '../simulations/dto/simulation-response.dto.ts';
import {
  ApplyScenarioResponseDto,
  ScenarioResponseDto,
  SimulateScenarioResponseDto,
  UpdateScenarioDto,
  toScenarioDto
} from './dto/scenario.dto.ts';

/**
 * Thin controller for the P5 scenario endpoints by id:
 * GET/PATCH/DELETE /scenarios/:id, POST /scenarios/:id/simulate,
 * POST /scenarios/:id/apply.
 */
@ApiTags('scenarios')
@Controller('scenarios')
export class ScenariosController {
  private readonly getScenario: GetScenarioUseCase;
  private readonly updateScenario: UpdateScenarioUseCase;
  private readonly deleteScenario: DeleteScenarioUseCase;
  private readonly simulateScenario: SimulateScenarioUseCase;
  private readonly applyScenario: ApplyScenarioUseCase;

  constructor(
    @Inject(GET_SCENARIO_USE_CASE) getScenario: GetScenarioUseCase,
    @Inject(UPDATE_SCENARIO_USE_CASE) updateScenario: UpdateScenarioUseCase,
    @Inject(DELETE_SCENARIO_USE_CASE) deleteScenario: DeleteScenarioUseCase,
    @Inject(SIMULATE_SCENARIO_USE_CASE) simulateScenario: SimulateScenarioUseCase,
    @Inject(APPLY_SCENARIO_USE_CASE) applyScenario: ApplyScenarioUseCase
  ) {
    this.getScenario = getScenario;
    this.updateScenario = updateScenario;
    this.deleteScenario = deleteScenario;
    this.simulateScenario = simulateScenario;
    this.applyScenario = applyScenario;
  }

  /**
   * @returns the scenario (200)
   * @throws 404 unknown scenario
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a scenario by id' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'scenario', type: ScenarioResponseDto })
  @ApiResponse({ status: 404, description: 'unknown scenario id', type: ErrorResponseDto })
  async get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<ScenarioResponseDto> {
    return toScenarioDto(await this.getScenario.execute(id));
  }

  /**
   * Patches name/description/commands (200). Commands are validated against
   * the building before saving (400/404 on invalid command).
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Patch a scenario (name/description/commands)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'updated scenario', type: ScenarioResponseDto })
  @ApiResponse({ status: 404, description: 'unknown scenario (or building) id', type: ErrorResponseDto })
  @ApiResponse({ status: 400, description: 'invalid command', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'unknown element id in a command', type: ErrorResponseDto })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateScenarioDto
  ): Promise<ScenarioResponseDto> {
    const scenario = await this.updateScenario.execute(id, {
      name: body.name,
      description: body.description,
      commands: body.commands
    });
    return toScenarioDto(scenario);
  }

  /**
   * Deletes the scenario and its result links (204). The building and the
   * simulation results are never touched (FR-P5-06 / AC-P5-04).
   *
   * @throws 404 unknown scenario
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a scenario (building and simulation results are kept)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'scenario deleted' })
  @ApiResponse({ status: 404, description: 'unknown scenario id', type: ErrorResponseDto })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    await this.deleteScenario.execute(id);
  }

  /**
   * Simulates the scenario through the P2 pipeline (Open3CL on the forked
   * building, same input-hash cache) and links the persisted result to the
   * scenario (FR-P5-02 / TR-P5-01).
   *
   * - 201 + result (`mode: 'sync'` computed now, `'cached'` served from cache — engine not called)
   * - 404 unknown scenario/building · 409 identical input hash in flight · 422/500 engine path errors
   */
  @Post(':id/simulate')
  @ApiOperation({ summary: 'Simulate the scenario via Open3CL (P2 pipeline, cached) and link the result' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'simulation computed now or served from cache', type: SimulateScenarioResponseDto })
  @ApiResponse({ status: 404, description: 'unknown scenario (or building) id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'identical input hash already in flight (body carries jobId)', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'mapping error', type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: 'engine error', type: ErrorResponseDto })
  async simulate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<SimulateScenarioResponseDto> {
    const { scenario, outcome } = await this.simulateScenario.execute(id);
    return {
      scenarioId: scenario.id,
      mode: outcome.kind === 'cached' ? 'cached' : 'sync',
      result: toSimulationResultDto(outcome.record)
    };
  }

  /**
   * Applies the scenario to the building (FR-P5-05): the scenario's commands
   * are applied ONE BY ONE through the same validated path as the P4 editor
   * (`Building.apply`), each incrementing the aggregate version and producing
   * one `BuildingUpdated` → one append-only audit row, all written in a
   * SINGLE optimistic-locked transaction; a `ScenarioApplied` event is
   * emitted on top and the baseline is re-simulated through the shared
   * pipeline (cache hit when the applied state was already simulated).
   *
   * - 200 + versions + per-command audit entries + re-simulated baseline
   * - 404 unknown scenario/building · 409 stale building version / in-flight simulation
   */
  @Post(':id/apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply the scenario to the building (commands applied one by one, +1 version each, audit rows in one transaction, baseline re-simulated)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'applier identity for the audit trail', schema: { type: 'string', example: 'user-42' } })
  @ApiResponse({ status: 200, description: 'scenario applied', type: ApplyScenarioResponseDto })
  @ApiResponse({ status: 404, description: 'unknown scenario (or building) id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'building version conflict (concurrent edit) or in-flight simulation', type: ErrorResponseDto })
  async apply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('x-user-id') userId: string | undefined
  ): Promise<ApplyScenarioResponseDto> {
    const result = await this.applyScenario.execute(id, { userId: userId ?? 'anonymous' });
    return {
      scenarioId: id,
      previousVersion: result.previousVersion,
      newVersion: result.newVersion,
      auditEntries: result.auditEntries.map(auditEntryToJson),
      simulationMode: result.simulation.kind === 'cached' ? 'cached' : 'sync',
      simulation: toSimulationResultDto(result.simulation.record)
    };
  }
}
