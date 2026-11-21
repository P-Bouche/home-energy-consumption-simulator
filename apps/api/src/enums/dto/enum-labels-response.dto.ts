import { ApiProperty } from '@nestjs/swagger';
import type { EnumLabelKind, EnumLabelTable } from '@hes/open3cl-adapter';

/**
 * Response of GET /enums/:kind: one DPE enum kind and its id -> French label
 * table (vendored from the pinned Open3CL engine, read-only presentation data).
 */
export class EnumLabelsResponseDto {
  @ApiProperty({ description: 'enum kind (domain command field name)', type: String, example: 'orientation' })
  kind!: EnumLabelKind;

  @ApiProperty({
    description: 'raw DPE enum id -> French label (unknown ids are simply absent and must be shown raw)',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { '1': 'sud', '2': 'nord' }
  })
  labels!: EnumLabelTable;
}
