import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { auditEntryToJson, geometryToJson, importReportToJson, parseBuildingCommand } from '@hes/domain';
import {
  EDIT_BUILDING_USE_CASE,
  EditBuildingUseCase,
  GET_AUDIT_LOG_USE_CASE,
  GET_BUILDING_USE_CASE,
  GetAuditLogUseCase,
  GetBuildingUseCase,
  RECONSTRUCT_BUILDING_USE_CASE,
  ReconstructBuildingUseCase,
  UNDO_LAST_CHANGE_USE_CASE,
  UndoLastChangeUseCase
} from '@hes/application';
import { ErrorResponseDto } from '../imports/dto/import-dpe-response.dto.ts';
import { BuildingResponseDto } from './dto/building-response.dto.ts';
import { GeometryResponseDto } from './dto/geometry-response.dto.ts';
import { AuditLogResponseDto, BUILDING_COMMAND_SCHEMA, EditBuildingResponseDto } from './dto/edit-building.dto.ts';

/**
 * Parses the mandatory `If-Match` header into the expected aggregate version.
 *
 * @throws BadRequestException (400) when the header is missing or not a
 * non-negative integer (optionally quoted, per RFC 7232)
 */
function parseIfMatch(header: string | undefined): number {
  if (header === undefined) {
    throw new BadRequestException('the If-Match header with the current building version is required');
  }
  const match = /^"?(\d+)"?$/.exec(header.trim());
  if (match === null) {
    throw new BadRequestException(`If-Match must be a non-negative integer version, got "${header}"`);
  }
  return Number(match[1]);
}

/**
 * Thin controller for buildings: read (P1) + reconstructed 3D geometry (P3),
 * and the P4 editing endpoints (PATCH edit, GET audit, POST undo). All
 * business logic lives in the application use cases; this class only adapts
 * HTTP (headers, body parsing).
 */
@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  private readonly getBuilding: GetBuildingUseCase;
  private readonly reconstructUseCase: ReconstructBuildingUseCase;
  private readonly editBuilding: EditBuildingUseCase;
  private readonly undoLastChange: UndoLastChangeUseCase;
  private readonly getAuditLog: GetAuditLogUseCase;

  constructor(
    @Inject(GET_BUILDING_USE_CASE) getBuilding: GetBuildingUseCase,
    @Inject(RECONSTRUCT_BUILDING_USE_CASE) reconstructUseCase: ReconstructBuildingUseCase,
    @Inject(EDIT_BUILDING_USE_CASE) editBuilding: EditBuildingUseCase,
    @Inject(UNDO_LAST_CHANGE_USE_CASE) undoLastChange: UndoLastChangeUseCase,
    @Inject(GET_AUDIT_LOG_USE_CASE) getAuditLog: GetAuditLogUseCase
  ) {
    this.getBuilding = getBuilding;
    this.reconstructUseCase = reconstructUseCase;
    this.editBuilding = editBuilding;
    this.undoLastChange = undoLastChange;
    this.getAuditLog = getAuditLog;
  }

  /**
   * @returns the building aggregate, its optimistic-locking version and its
   * import report (200)
   * @throws 404 when the id is unknown
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a persisted building, its version and its import report' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'building + version + report', type: BuildingResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async getBuildingById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<BuildingResponseDto> {
    const { building, report } = await this.getBuilding.execute(id);
    return { building: building.toJson(), report: importReportToJson(report), version: building.version };
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

  /**
   * Applies one validated domain command to the building (P4, FR-P4-01).
   * The body is a versioned command (see the OpenAPI schema); `If-Match` must
   * carry the version the client based its edit on.
   *
   * - 200 + updated building + audit entry on success
   * - 400 + fieldErrors when the domain rejects the command (nothing persisted)
   * - 404 unknown building or unknown element id
   * - 409 stale If-Match version (body carries expectedVersion/currentVersion)
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Apply an edit command to the building (optimistic locking via If-Match)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiHeader({ name: 'If-Match', required: true, description: 'current building version (optimistic locking)', schema: { type: 'string', example: '0' } })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'editor identity for the audit trail', schema: { type: 'string', example: 'user-42' } })
  @ApiBody({ schema: BUILDING_COMMAND_SCHEMA })
  @ApiResponse({ status: 200, description: 'edit applied, version incremented, audit entry appended', type: EditBuildingResponseDto })
  @ApiResponse({ status: 400, description: 'invalid command (fieldErrors) or unparseable body (issues)', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id or unknown element id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'stale If-Match version (expectedVersion/currentVersion in body)', type: ErrorResponseDto })
  async patchBuilding(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: unknown
  ): Promise<EditBuildingResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const parsed = parseBuildingCommand(body);
    if (!parsed.ok) {
      throw parsed.error;
    }
    const command = parsed.value;
    if (command.buildingId !== id) {
      throw new BadRequestException(`command buildingId ${command.buildingId} does not match the URL id ${id}`);
    }
    const { building, entry } = await this.editBuilding.execute(id, command, {
      expectedVersion,
      userId: userId ?? 'anonymous'
    });
    return { building: building.toJson(), version: building.version, auditEntry: auditEntryToJson(entry) };
  }

  /**
   * @returns the append-only audit trail of the building, oldest first (FR-P4-03)
   * @throws 404 unknown building
   */
  @Get(':id/audit')
  @ApiOperation({ summary: 'List the audit trail of a building (oldest first)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'audit entries', type: AuditLogResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  async getAudit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string
  ): Promise<AuditLogResponseDto> {
    const { buildingId, entries } = await this.getAuditLog.execute(id);
    return { buildingId, entries: entries.map(auditEntryToJson) };
  }

  /**
   * Undoes the last change of the building (FR-P4-05): reads the latest audit
   * entry and applies its inverse command through the same validated +
   * optimistic-locked + audited path. The undo is itself audit-logged.
   *
   * - 200 + updated building + audit entry on success
   * - 400 when there is nothing to undo
   * - 404 unknown building · 409 stale If-Match version
   */
  @Post(':id/undo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo the last change of the building (audit-logged inverse command)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiHeader({ name: 'If-Match', required: true, description: 'current building version (optimistic locking)', schema: { type: 'string', example: '1' } })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'editor identity for the audit trail', schema: { type: 'string' } })
  @ApiResponse({ status: 200, description: 'last change undone, version incremented, audit entry appended', type: EditBuildingResponseDto })
  @ApiResponse({ status: 400, description: 'nothing to undo', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'unknown building id', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'stale If-Match version', type: ErrorResponseDto })
  async undoBuilding(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-user-id') userId: string | undefined
  ): Promise<EditBuildingResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const { building, entry } = await this.undoLastChange.execute(id, {
      expectedVersion,
      userId: userId ?? 'anonymous'
    });
    return { building: building.toJson(), version: building.version, auditEntry: auditEntryToJson(entry) };
  }
}
