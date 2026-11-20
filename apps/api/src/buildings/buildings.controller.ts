import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { importReportToJson } from '@hes/domain';
import { GET_BUILDING_USE_CASE, GetBuildingUseCase } from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { BuildingResponseDto } from './dto/building-response.dto.ts';

/**
 * Thin controller for reading persisted buildings (round-trip counterpart of
 * POST /imports/dpe).
 */
@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  private readonly useCase: GetBuildingUseCase;

  constructor(@Inject(GET_BUILDING_USE_CASE) useCase: GetBuildingUseCase) {
    this.useCase = useCase;
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
}
