import type { BuildProfile, Logger, Worker } from "@devdeploy/core";
import { ProviderRegistry } from "./ProviderRegistry.js";

export interface SelectionResult {
  worker: Worker;
  reason: string;
}

export interface SelectionRejection {
  worker: Worker;
  reason: string;
}

export interface SelectionOutcome {
  selected?: SelectionResult;
  rejected: SelectionRejection[];
}

/**
 * Implements the spec's "evaluate each provider in priority order, pick the first
 * READY one" automatic selection. Never picks a cost-sensitive worker (e.g. a
 * MacinCloud Mac, billed by session time) unless the profile has explicitly
 * authorized paid providers — this is the "do not silently incur cloud costs" rule.
 */
export class ProviderSelector {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly logger: Logger,
  ) {}

  async select(profile: BuildProfile, workers: Worker[]): Promise<SelectionOutcome> {
    const priority = profile.providerPriority;
    const rejected: SelectionRejection[] = [];

    for (const providerType of priority) {
      const candidates = workers
        .filter((worker) => worker.providerType === providerType && worker.enabled)
        .sort((a, b) => a.priority - b.priority);

      for (const worker of candidates) {
        const outcome = await this.evaluate(profile, worker);
        if (outcome.ok) {
          return { selected: { worker, reason: outcome.reason }, rejected };
        }
        rejected.push({ worker, reason: outcome.reason });
      }
    }

    return { rejected };
  }

  private async evaluate(profile: BuildProfile, worker: Worker): Promise<{ ok: boolean; reason: string }> {
    if (worker.costSensitive && !profile.requireCostAuthorization) {
      return { ok: false, reason: "Worker is cost-sensitive and this profile has not authorized paid providers" };
    }

    const provider = this.registry.get(worker.providerType);
    const health = await provider.checkHealth(worker);
    if (health.state !== "READY") {
      return { ok: false, reason: `${health.state}: ${health.reasons.join("; ") || "no reason given"}` };
    }

    const capabilities = worker.capabilities ?? (await provider.detectCapabilities(worker));
    if (!provider.canHandle(profile, capabilities)) {
      return { ok: false, reason: "Worker capabilities do not match this profile's platform/requirements" };
    }

    this.logger.info(`Selected worker ${worker.name} (${worker.providerType}) for profile ${profile.name}`);
    return { ok: true, reason: "Healthy and capable" };
  }
}
