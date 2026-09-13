import type { BuildProviderType, Platform } from "./BuildProviderType.js";
import type { JobStatus } from "./JobStatus.js";

/** One step of a job's log, streamed as the build progresses. */
export interface JobLogLine {
  timestamp: string;
  stream: "stdout" | "stderr" | "devdeploy";
  text: string;
}

/** A single build/deploy request, from source through to a delivered artifact. */
export interface Job {
  id: string;
  appId: string;
  profileId: string;
  platform: Platform;
  status: JobStatus;
  /** Provider types this job is allowed to run on, in priority order. Empty = use the app's default priority. */
  allowedProviders: BuildProviderType[];
  /** Provider actually selected once SELECTING_WORKER completes. */
  selectedProvider?: BuildProviderType;
  selectedWorkerId?: string;
  gitRepoUrl: string;
  gitRef: string;
  gitCommit?: string;
  targetDeviceId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  artifactId?: string;
}

export interface CreateJobRequest {
  appId: string;
  profileId: string;
  gitRef?: string;
  targetDeviceId?: string;
}
