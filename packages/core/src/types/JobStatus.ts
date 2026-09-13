/** Lifecycle states a build job moves through, in order. Terminal states: SUCCEEDED, FAILED, CANCELLED. */
export const JobStatus = {
  QUEUED: "QUEUED",
  SELECTING_WORKER: "SELECTING_WORKER",
  PREPARING: "PREPARING",
  INSTALLING_DEPENDENCIES: "INSTALLING_DEPENDENCIES",
  BUILDING: "BUILDING",
  SIGNING: "SIGNING",
  TESTING: "TESTING",
  EXPORTING: "EXPORTING",
  UPLOADING_ARTIFACT: "UPLOADING_ARTIFACT",
  VALIDATING_ARTIFACT: "VALIDATING_ARTIFACT",
  DEPLOYING: "DEPLOYING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

/** Worker/provider readiness, returned by checkHealth(). */
export const WorkerHealthState = {
  READY: "READY",
  DEGRADED: "DEGRADED",
  UNAVAILABLE: "UNAVAILABLE",
  NOT_CONFIGURED: "NOT_CONFIGURED",
} as const;

export type WorkerHealthState = (typeof WorkerHealthState)[keyof typeof WorkerHealthState];
