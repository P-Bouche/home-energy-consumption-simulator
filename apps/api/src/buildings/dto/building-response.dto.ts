import { ApiProperty } from '@nestjs/swagger';
import type { BuildingJson, ImportReportJson } from '@hes/domain';

/**
 * Response of GET /buildings/:id (FR-P1-06): the persisted Building aggregate
 * (BuildingJson shape) and the import report that produced it.
 */
export class BuildingResponseDto {
  @ApiProperty({ description: 'the Building aggregate (JSON persistence shape)', type: 'object', additionalProperties: true })
  building!: BuildingJson;

  @ApiProperty({ description: 'optimistic-locking version of the aggregate (P4; send it back as If-Match on edits)', type: Number })
  version!: number;

  @ApiProperty({ description: 'import report v1', type: 'object', additionalProperties: true })
  report!: ImportReportJson;
}
