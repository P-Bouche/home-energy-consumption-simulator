import type { BuildingId } from './entities.ts';

/**
 * Base interface for domain events.
 */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

/**
 * Emitted by the Building aggregate when a DPE XML has been imported and the
 * aggregate constructed. Used for audit and future IoT sync (P9).
 */
export class BuildingImported implements DomainEvent {
  readonly type = 'BuildingImported';
  readonly buildingId: BuildingId;
  readonly dpeNumber: string | null;
  readonly occurredAt: Date;

  constructor(buildingId: BuildingId, dpeNumber: string | null, occurredAt: Date) {
    this.buildingId = buildingId;
    this.dpeNumber = dpeNumber;
    this.occurredAt = occurredAt;
  }
}
