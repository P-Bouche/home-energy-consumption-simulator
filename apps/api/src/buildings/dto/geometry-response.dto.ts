import { ApiProperty } from '@nestjs/swagger';
import type { GeometryJson } from '@hes/domain';

/**
 * Response of GET /buildings/:id/geometry: the deterministically reconstructed
 * 3D geometry of the building (P3). `geometry` is the domain GeometryJson —
 * plain data, stable per building (same building → same meshHash).
 */
export class GeometryResponseDto {
  @ApiProperty({ description: 'building id', type: String, format: 'uuid' })
  buildingId!: string;

  @ApiProperty({
    description: 'reconstructed 3D geometry (plain JSON: elements with meshes, confidence, meshHash)',
    type: 'object',
    additionalProperties: true
  })
  geometry!: GeometryJson;
}
