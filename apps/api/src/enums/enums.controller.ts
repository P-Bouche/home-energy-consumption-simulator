import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ENUM_LABELS, ENUM_LABEL_KINDS, isEnumLabelKind } from '@hes/open3cl-adapter';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { EnumLabelsResponseDto } from './dto/enum-labels-response.dto.ts';

/**
 * Thin read-only controller exposing the DPE enum label tables vendored in
 * the Open3CL adapter (GET /enums/:kind). Pure presentation data over the
 * frozen raw-id command contract: the web editor shows the French label and
 * still sends the raw enum id in `building.*.update.v1` commands. No use
 * case needed — the tables are static data, so the controller reads them
 * directly from the adapter package.
 */
@ApiTags('enums')
@Controller('enums')
export class EnumsController {
  /**
   * @returns the id -> French-label table of one enum kind (200)
   * @throws 404 when the kind is unknown
   */
  @Get(':kind')
  @ApiOperation({ summary: 'Get the French label table of one DPE enum kind (read-only, presentation data)' })
  @ApiParam({
    name: 'kind',
    type: 'string',
    enum: ENUM_LABEL_KINDS,
    description: 'enum kind (domain command field name), e.g. orientation, wallType, ventilationType'
  })
  @ApiResponse({ status: 200, description: 'enum kind + id -> French label table', type: EnumLabelsResponseDto })
  @ApiResponse({ status: 404, description: 'unknown enum kind', type: ErrorResponseDto })
  getEnumLabels(@Param('kind') kind: string): EnumLabelsResponseDto {
    if (!isEnumLabelKind(kind)) {
      throw new NotFoundException(`unknown enum kind "${kind}" (expected one of: ${ENUM_LABEL_KINDS.join(', ')})`);
    }
    return { kind, labels: ENUM_LABELS[kind] };
  }
}
