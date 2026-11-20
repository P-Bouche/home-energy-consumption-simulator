import type {
  BuildingId,
  SimulationInputHash,
  SimulationJob,
  SimulationJobId,
  SimulationResultId,
  SimulationResultRecord
} from '@hes/domain';
import { SimulationAlreadyInFlightError, type SimulationRepository } from '@hes/application';

/**
 * In-memory SimulationRepository used when DATABASE_URL=memory:// (local
 * demos and Playwright e2e without Docker). Not for production persistence.
 * Enforces the same invariants as the Postgres adapter: one result per
 * (buildingId, inputHash) (cache) and at most one in-flight job per
 * (buildingId, inputHash).
 */
export class InMemorySimulationRepository implements SimulationRepository {
  private readonly results = new Map<SimulationResultId, SimulationResultRecord>();
  private readonly jobs = new Map<SimulationJobId, SimulationJob>();

  saveResult(record: SimulationResultRecord): Promise<SimulationResultRecord> {
    const existing = [...this.results.values()].find(
      (r) => r.buildingId === record.buildingId && r.inputHash === record.inputHash
    );
    if (existing === undefined) {
      this.results.set(record.id, record);
      return Promise.resolve(record);
    }
    // Lost the persistence race: return the already-stored winning record so
    // the caller never holds an unpersisted id.
    return Promise.resolve(existing);
  }

  findResultById(id: SimulationResultId): Promise<SimulationResultRecord | null> {
    return Promise.resolve(this.results.get(id) ?? null);
  }

  findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]> {
    return Promise.resolve(
      [...this.results.values()]
        .filter((r) => r.buildingId === buildingId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    );
  }

  findResultByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationResultRecord | null> {
    return Promise.resolve(
      [...this.results.values()].find((r) => r.buildingId === buildingId && r.inputHash === inputHash) ?? null
    );
  }

  saveJob(job: SimulationJob): Promise<void> {
    const active = [...this.jobs.values()].find(
      (j) => j.buildingId === job.buildingId && j.inputHash === job.inputHash && !j.isTerminal()
    );
    if (active !== undefined) {
      return Promise.reject(new SimulationAlreadyInFlightError(active.id, job.inputHash));
    }
    this.jobs.set(job.id, job);
    return Promise.resolve();
  }

  updateJob(job: SimulationJob): Promise<void> {
    this.jobs.set(job.id, job);
    return Promise.resolve();
  }

  findJobById(id: SimulationJobId): Promise<SimulationJob | null> {
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  findActiveJobByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationJob | null> {
    return Promise.resolve(
      [...this.jobs.values()].find(
        (j) => j.buildingId === buildingId && j.inputHash === inputHash && !j.isTerminal()
      ) ?? null
    );
  }
}
