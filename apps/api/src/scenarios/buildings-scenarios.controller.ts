import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  COMPARE_SCENARIOS_USE_CASE,
  CREATE_SCENARIO_USE_CASE,
  LIST_SCENARIOS_USE_CASE,
  CompareScenariosUseCase,
  CreateScenarioUseCase,
  ListScenariosUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import {
  CompareScenariosDto,
  CreateScenarioDto,
  ScenarioComparisonResponseDto,
  ScenarioListResponseDto,
  ScenarioResponseDto,
  toComparisonDto,
  toScenarioDto
} from './dto/scenario.dto.ts';

/**
 * Thin controller for the P5 scenario endpoints scoped to a building:
 * POST /buildings/:id/scenarios (create), GET /buildings/:id/scenarios (list),
 * POST /buildings/:id/compare (baseline + scenario deltas, p95 < 1 s cached).
 */
@ApiTags('buildings')
@Controller('buildings')
export class BuildingsScenariosController {
  private readonly createScenario: CreateScenarioUseCase;
  private readonly listScenarios: ListScenariosUseCase;
  private readonly compare: CompareScenariosUseCase;

  constructor(
    @Inject(CREATE_SCENARIO_USE_CASE) createScenario: CreateScenarioUseCase,
    @Inject(LIST_SCENARIOS_USE_CASE) listScenarios: ListScenariosUseCase,
    @Inject(COMPARE_SCENARIOS_USE_CASE) compare: CompareScenariosUseCase
  ) {
    this.createScenario = createScenario;
    this.listScenarios = listScenarios;
    this.compare = compare;
  }

  /**
   * Creates a renovation scenario on the building: a named declarative
   * change-set (versioned commands) applied on a fork of the current state
   * (FR-P5-01).
   *
   * - 201 + scenario
   * - 404 unknown building · 400 invalid command · 404 unknown element id
   */
  @Post(':id/scenarios')
  @ApiOperation({ summary: 'Create a renovation scenario (named change-set of versioned commands) on the building' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'scenario created', type: ScenarioResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  @ApiResponse({ status: 400, description: 'invalid command (unknown tag, bad value, empty change-set)', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'unknown element id in a command', type: ErrorResponseDto })
  async create(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CreateScenarioDto
  ): Promise<ScenarioResponseDto> {
    const { scenario } = await this.createScenario.execute(id, {
      name: body.name,
      description: body.description,
      commands: body.commands
    });
    return toScenarioDto(scenario);
  }

  /**
   * @returns the scenarios of the building, oldest first
   * @throws 404 unknown building
   */
  @Get(':id/scenarios')
  @ApiOperation({ summary: 'List the scenarios of a building (oldest first)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'scenario list', type: ScenarioListResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async list(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<ScenarioListResponseDto> {
    const scenarios = await this.listScenarios.execute(id);
    return { buildingId: id, scenarios: scenarios.map(toScenarioDto) };
  }

  /**
   * Compares the baseline (current building state) with the scenarios
   * (FR-P5-03): per-scenario absolute values + deltas vs baseline (kWh, kg
   * CO2e), label changes and rank. Served from the P2 input-hash cache when
   * results exist (p95 < 1 s); scenarios never simulated are simulated now
   * through the same pipeline (their ids are returned in `simulatedNow`).
   *
   * - 200 + comparison
   * - 404 unknown building or unknown scenarioId · 409 identical input hash in flight
   */
  @Post(':id/compare')
  @HttpCode(200)
  @ApiOperation({ summary: 'Compare baseline + scenarios: deltas (kWh, kg CO2e), label changes, rank (p95 < 1 s when cached)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'comparison (baseline + ranked scenario entries)', type: ScenarioComparisonResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id or scenario id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'identical input hash already in flight (body carries jobId)', type: ErrorResponseDto })
  async compareBuilding(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body?: CompareScenariosDto
  ): Promise<ScenarioComparisonResponseDto> {
    const { comparison, simulatedNow } = await this.compare.execute(id, { scenarioIds: body?.scenarioIds });
    return toComparisonDto(comparison, simulatedNow);
  }
}
