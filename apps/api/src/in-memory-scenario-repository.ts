import { Scenario, type BuildingId, type ScenarioId, type SimulationResultId } from '@hes/domain';
import type { ScenarioRepository, ScenarioResultLink } from '@hes/application';

/**
 * In-memory ScenarioRepository used when DATABASE_URL=memory:// (local demos
 * and Playwright e2e without Docker). Not for production persistence. Mirrors
 * the Postgres adapter's invariants: scenarios ordered by creation, result
 * links unique per (scenarioId, simulationId), delete removes only the
 * scenario and its links.
 */
export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly scenarios = new Map<ScenarioId, Scenario>();
  private readonly links: ScenarioResultLink[] = [];

  save(scenario: Scenario): Promise<void> {
    this.scenarios.set(scenario.id, scenario);
    return Promise.resolve();
  }

  findById(id: ScenarioId): Promise<Scenario | null> {
    return Promise.resolve(this.scenarios.get(id) ?? null);
  }

  findByBuildingId(buildingId: BuildingId): Promise<readonly Scenario[]> {
    return Promise.resolve(
      [...this.scenarios.values()]
        .filter((s) => s.buildingId === buildingId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    );
  }

  update(scenario: Scenario): Promise<void> {
    if (!this.scenarios.has(scenario.id)) {
      return Promise.reject(new Error(`unknown scenario ${scenario.id}`));
    }
    this.scenarios.set(scenario.id, scenario);
    return Promise.resolve();
  }

  delete(id: ScenarioId): Promise<void> {
    this.scenarios.delete(id);
    for (let i = this.links.length - 1; i >= 0; i -= 1) {
      if (this.links[i]?.scenarioId === id) {
        this.links.splice(i, 1);
      }
    }
    return Promise.resolve();
  }

  linkResult(link: ScenarioResultLink): Promise<void> {
    if (!this.links.some((l) => l.scenarioId === link.scenarioId && l.simulationId === link.simulationId)) {
      this.links.push(link);
    }
    return Promise.resolve();
  }

  findLatestResultId(scenarioId: ScenarioId): Promise<SimulationResultId | null> {
    const links = this.links.filter((l) => l.scenarioId === scenarioId);
    if (links.length === 0) {
      return Promise.resolve(null);
    }
    const latest = links.reduce((a, b) => (b.createdAt.getTime() >= a.createdAt.getTime() ? b : a));
    return Promise.resolve(latest.simulationId);
  }

  findResultLinks(scenarioId: ScenarioId): Promise<readonly ScenarioResultLink[]> {
    return Promise.resolve(
      this.links
        .filter((l) => l.scenarioId === scenarioId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    );
  }
}
