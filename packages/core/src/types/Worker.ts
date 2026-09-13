import type { BuildProviderType } from "./BuildProviderType.js";
import type { WorkerHealthState } from "./JobStatus.js";

/** Capabilities a worker/provider self-reports, used to decide whether it can run a given job. */
export interface ProviderCapabilities {
  platforms: string[];
  hasXcode?: boolean;
  xcodeVersions?: string[];
  selectedXcodeVersion?: string;
  iosSdkVersions?: string[];
  installedSimulators?: string[];
  availableDevices?: string[];
  signingReady?: boolean;
  provisioningProfiles?: string[];
  signingIdentities?: string[];
  hasDocker?: boolean;
  hasCocoaPods?: boolean;
  cocoaPodsVersion?: string;
  hasSwiftPackageManager?: boolean;
  nodeVersion?: string;
  npmVersion?: string;
  macOsVersion?: string;
  architecture?: string;
  diskFreeBytes?: number;
  totalMemoryBytes?: number;
  [extra: string]: unknown;
}

/** Result of a worker/provider health check. */
export interface HealthCheckResult {
  state: WorkerHealthState;
  reasons: string[];
  checkedAt: string;
}

/** How to reach a remote worker (e.g. the devdeploy-agent on a Mac). Never sent to the dashboard as-is. */
export interface WorkerConnection {
  baseUrl: string;
  apiKey: string;
}

/** A registered build worker (a specific machine/environment behind a BuildProvider). */
export interface Worker {
  id: string;
  name: string;
  providerType: BuildProviderType;
  hostname?: string;
  ipAddress?: string;
  priority: number;
  enabled: boolean;
  connection?: WorkerConnection;
  /** True for workers that cost real money per use (e.g. a MacinCloud account billed by session time). */
  costSensitive?: boolean;
  capabilities?: ProviderCapabilities;
  lastHealth?: HealthCheckResult;
  activeJobIds: string[];
  registeredAt: string;
  updatedAt: string;
}

/** Worker with connection secrets stripped — the shape ever sent to the dashboard/API clients. */
export type PublicWorker = Omit<Worker, "connection"> & { paired: boolean };

export function toPublicWorker(worker: Worker): PublicWorker {
  const { connection, ...rest } = worker;
  return { ...rest, paired: Boolean(connection) };
}

export interface RegisterWorkerRequest {
  name: string;
  providerType: BuildProviderType;
  hostname?: string;
  ipAddress?: string;
  priority?: number;
  connection?: Record<string, unknown>;
}
