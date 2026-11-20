import { ApiProperty } from '@nestjs/swagger';
import type { ImportReportJson } from '@hes/domain';

/**
 * Response of POST /imports/dpe (FR-P1-01): { buildingId, report }.
 */
export class ImportDpeResponseDto {
  @ApiProperty({ description: 'id of the persisted Building aggregate', type: String, format: 'uuid' })
  buildingId!: string;

  @ApiProperty({
    description: 'import report v1 (parsed / inferred / unrecognized / missing fields)',
    type: 'object',
    additionalProperties: true
  })
  report!: ImportReportJson;
}

/**
 * Error body returned on 422/404/413/500.
 */
export class ErrorResponseDto {
  @ApiProperty({ type: Number }) statusCode!: number;
  @ApiProperty({ type: String }) error!: string;
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ type: [String], required: false, description: 'schema issues (422 only)' })
  schemaErrors?: string[];
}
