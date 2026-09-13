import type { BuildProviderType } from "../types/BuildProviderType.js";
import type { BuildApp, BuildProfile } from "../types/BuildApp.js";
import type { Job, JobLogLine } from "../types/Job.js";
import type { HealthCheckResult, ProviderCapabilities, Worker } from "../types/Worker.js";
import type { Artifact } from "../types/Artifact.js";

/** Everything a provider needs to run one job: the job itself, its app/profile, and a local workspace to build in. */
export interface JobContext {
  job: Job;
  app: BuildApp;
  profile: BuildProfile;
  /** The worker this job was dispatched to. Remote providers (Mac agent, CI) use this for connection info. */
  worker: Worker;
  /** Isolated directory for this job's source + build output. Never shared with another job. */
  workDir: string;
  onLog: (line: JobLogLine) => void;
}

export interface BuildResult {
  success: boolean;
  errorMessage?: string;
}

export interface ExportResult {
  artifact: Artifact;
}

/**
 * A build environment DevDeploy can dispatch a job to — the Pi itself, a container,
 * a Mac running Xcode, or a cloud CI provider. Every provider type implements this
 * same interface so the orchestrator never hard-codes which one it's talking to.
 */
export interface BuildProvider {
  readonly type: BuildProviderType;

  /** Inspect the environment and report what it can actually do (Xcode? Docker? which SDKs?). */
  detectCapabilities(worker: Worker): Promise<ProviderCapabilities>;

  /** Cheap, frequent check: is this provider usable right now? */
  checkHealth(worker: Worker): Promise<HealthCheckResult>;

  /** True if this provider's current capabilities can build the given profile at all. */
  canHandle(profile: BuildProfile, capabilities: ProviderCapabilities): boolean;

  /** Allocate an isolated job workspace (temp dir, container, or remote job folder). */
  prepareJob(ctx: JobContext): Promise<void>;

  /** Fetch source into the job workspace. */
  receiveSource(ctx: JobContext): Promise<void>;

  /** Install language/package-manager dependencies (npm, CocoaPods, Gradle, etc.), whatever the project needs. */
  installDependencies(ctx: JobContext): Promise<void>;

  /** Compile/archive the project. */
  build(ctx: JobContext): Promise<BuildResult>;

  /** Sign the build output, if the profile's distribution requires it. No-op where not applicable. */
  sign(ctx: JobContext): Promise<void>;

  /** Run the project's test suite, if the profile requests it. No-op by default. */
  test(ctx: JobContext): Promise<void>;

  /** Produce the final installable artifact (IPA/APK/AAB) from the build output. */
  exportArtifact(ctx: JobContext): Promise<ExportResult>;

  /** Move the artifact from wherever it was produced back to DevDeploy's own artifact store. */
  returnArtifact(ctx: JobContext, artifact: Artifact): Promise<void>;

  /** Stream this job's log lines as they're produced. Called once; provider pushes via ctx.onLog. */
  streamLogs(ctx: JobContext): Promise<void>;

  /** Best-effort abort of an in-progress job. */
  cancelJob(ctx: JobContext): Promise<void>;

  /** Remove the job's temporary workspace/container. Always called, success or failure. */
  cleanup(ctx: JobContext): Promise<void>;
}

/** Thrown by a provider whose capability genuinely doesn't exist yet (a stubbed provider type). */
export class ProviderNotImplementedError extends Error {
  constructor(providerType: BuildProviderType, operation: string) {
    super(`${providerType} does not implement ${operation} yet`);
    this.name = "ProviderNotImplementedError";
  }
}
