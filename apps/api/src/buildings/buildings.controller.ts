import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { geometryToJson, importReportToJson } from '@hes/domain';
import {
  GET_BUILDING_USE_CASE,
  GetBuildingUseCase,
  RECONSTRUCT_BUILDING_USE_CASE,
  ReconstructBuildingUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { BuildingResponseDto } from './dto/building-response.dto.ts';
import { GeometryResponseDto } from './dto/geometry-response.dto.ts';

/**
 * Thin controller for reading persisted buildings (round-trip counterpart of
 * POST /imports/dpe) and their reconstructed 3D geometry (P3).
 */
@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  private readonly useCase: GetBuildingUseCase;
  private readonly reconstructUseCase: ReconstructBuildingUseCase;

  constructor(
    @Inject(GET_BUILDING_USE_CASE) useCase: GetBuildingUseCase,
    @Inject(RECONSTRUCT_BUILDING_USE_CASE) reconstructUseCase: ReconstructBuildingUseCase
  ) {
    this.useCase = useCase;
    this.reconstructUseCase = reconstructUseCase;
  }

  /**
   * @returns the building aggregate and its import report (200)
   * @throws 404 when the id is unknown
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a persisted building and its import report' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'building + report', type: BuildingResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async getBuilding(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<BuildingResponseDto> {
    const { building, report } = await this.useCase.execute(id);
    return { building: building.toJson(), report: importReportToJson(report) };
  }

  /**
   * Reconstructed 3D geometry of the building (P3, server-side so the < 2 s
   * budget and the deterministic mesh hash are stable). Pure computation on
   * the persisted aggregate: same building → same response (same meshHash).
   *
   * @returns the geometry JSON (200)
   * @throws 404 when the id is unknown
   */
  @Get(':id/geometry')
  @ApiOperation({ summary: 'Get the reconstructed 3D geometry of a building (P3)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'reconstructed geometry', type: GeometryResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async getBuildingGeometry(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ): Promise<GeometryResponseDto> {
    const { building, geometry } = await this.reconstructUseCase.execute(id);
    return { buildingId: building.id, geometry: geometryToJson(geometry) };
  }
}
