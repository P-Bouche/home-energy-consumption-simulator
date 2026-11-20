import { ApiProperty, type SchemaObject } from '@nestjs/swagger';
import type { AuditEntryJson, BuildingJson } from '@hes/domain';

/**
 * Response of PATCH /buildings/:id and POST /buildings/:id/undo (P4): the
 * updated aggregate, its new optimistic-locking version, and the audit entry
 * that was appended for the change.
 */
export class EditBuildingResponseDto {
  @ApiProperty({ description: 'the updated Building aggregate (JSON persistence shape)', type: 'object', additionalProperties: true })
  building!: BuildingJson;

  @ApiProperty({ description: 'optimistic-locking version of the aggregate after the edit (send it back as If-Match)', type: Number })
  version!: number;

  @ApiProperty({ description: 'the appended audit entry (who / when / command / old→new)', type: 'object', additionalProperties: true })
  auditEntry!: AuditEntryJson;
}

/**
 * Response of GET /buildings/:id/audit (P4, FR-P4-03): the append-only audit
 * trail of the building, oldest first.
 */
export class AuditLogResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  buildingId!: string;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  entries!: AuditEntryJson[];
}

/**
 * OpenAPI schema of a PATCH /buildings/:id command body: a discriminated union
 * on `type` over the versioned P4 command vocabulary (COMMAND_VOCABULARY_VERSION = 1).
 */
export const BUILDING_COMMAND_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['type', 'buildingId', 'wallId'],
      properties: {
        type: { type: 'string', enum: ['building.wall.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        wallId: { type: 'string' },
        uValueWm2K: { type: 'number', nullable: true },
        areaM2: { type: 'number', nullable: true },
        description: { type: 'string' },
        orientation: { type: 'string', nullable: true },
        wallType: { type: 'string', nullable: true },
        adjacencyType: { type: 'string', nullable: true }
      }
    },
    {
      type: 'object',
      required: ['type', 'buildingId', 'windowId'],
      properties: {
        type: { type: 'string', enum: ['building.window.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        windowId: { type: 'string' },
        uValueWm2K: { type: 'number', nullable: true },
        areaM2: { type: 'number', nullable: true },
        description: { type: 'string' },
        orientation: { type: 'string', nullable: true },
        count: { type: 'number', nullable: true },
        solarFactorSw: { type: 'number', nullable: true },
        glazingType: { type: 'string', nullable: true },
        frameMaterial: { type: 'string', nullable: true }
      }
    },
    {
      type: 'object',
      required: ['type', 'buildingId', 'roofId'],
      properties: {
        type: { type: 'string', enum: ['building.roof.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        roofId: { type: 'string' },
        uValueWm2K: { type: 'number', nullable: true },
        areaM2: { type: 'number', nullable: true },
        description: { type: 'string' },
        roofType: { type: 'string', nullable: true },
        adjacencyType: { type: 'string', nullable: true }
      }
    },
    {
      type: 'object',
      required: ['type', 'buildingId', 'floorId'],
      properties: {
        type: { type: 'string', enum: ['building.floor.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        floorId: { type: 'string' },
        uValueWm2K: { type: 'number', nullable: true },
        areaM2: { type: 'number', nullable: true },
        description: { type: 'string' },
        floorType: { type: 'string', nullable: true },
        adjacencyType: { type: 'string', nullable: true }
      }
    },
    {
      type: 'object',
      required: ['type', 'buildingId', 'systemId'],
      properties: {
        type: { type: 'string', enum: ['building.heating-system.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        systemId: { type: 'string' },
        description: { type: 'string' },
        installationType: { type: 'string', nullable: true },
        heatedAreaM2: { type: 'number', nullable: true }
      }
    },
    {
      type: 'object',
      required: ['type', 'buildingId', 'systemId'],
      properties: {
        type: { type: 'string', enum: ['building.ventilation-system.update.v1'] },
        buildingId: { type: 'string', format: 'uuid' },
        systemId: { type: 'string' },
        description: { type: 'string' },
        ventilationType: { type: 'string', nullable: true },
        ventilatedAreaM2: { type: 'number', nullable: true },
        q4paConv: { type: 'number', nullable: true }
      }
    }
  ]
} as unknown as SchemaObject;
