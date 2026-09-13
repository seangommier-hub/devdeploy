import { join } from "node:path";
import {
  JobStatus,
  sha256File,
  type AppRepository,
  type ArtifactRepository,
  type BuildApp,
  type BuildProfile,
  type Job,
  type JobContext,
  type JobRepository,
  type Logger,
  type Worker,
  type WorkerRepository,
} from "@devdeploy/core";
import { ProviderRegistry, ProviderSelector } from "@devdeploy/providers";
import { JobLogBroadcaster } from "./JobLogBroadcaster.js";
import { ArtifactStore } from "./ArtifactStore.js";

export interface JobExecutorDeps {
  registry: ProviderRegistry;
  selector: ProviderSelector;
  jobs: JobRepository;
  apps: AppRepository;
  workers: WorkerRepository;
  artifacts: ArtifactRepository;
  artifactStore: ArtifactStore;
  broadcaster: JobLogBroadcaster;
  jobsDir: string;
  logger: Logger;
}

/**
 * Runs one job through the full pipeline described in the spec: select worker,
 * prepare, fetch source, install deps, build, sign, test, export, return artifact,
 * validate, cleanup. Every transition is persisted so the dashboard always reflects
 * real state, not just in-memory state that a restart would lose.
 */
export class JobExecutor {
  constructor(private readonly deps: JobExecutorDeps) {}

  /** Best-effort cancellation: reconstructs the same context the job ran with and asks its provider to stop. */
  async cancel(jobId: string): Promise<Job> {
    const job = await this.deps.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.selectedProvider && job.selectedWorkerId) {
      const [app, worker] = await Promise.all([this.deps.apps.get(job.appId), this.deps.workers.get(job.selectedWorkerId)]);
      const profile = app?.profiles.find((candidate) => candidate.id === job.profileId);
      if (app && profile && worker) {
        const ctx = this.buildContext(job, app, profile, worker);
        await this.deps.registry.get(job.selectedProvider).cancelJob(ctx);
      }
    }
    job.status = JobStatus.CANCELLED;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    await this.deps.jobs.set(job);
    return job;
  }

  async run(jobId: string): Promise<void> {
    const job = await this.deps.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    const app = await this.deps.apps.get(job.appId);
    if (!app) return this.fail(job, `App ${job.appId} not found`);
    const profile = app.profiles.find((candidate) => candidate.id === job.profileId);
    if (!profile) return this.fail(job, `Profile ${job.profileId} not found on app ${app.id}`);

    const worker = await this.selectWorker(job, profile);
    if (!worker) return;

    const ctx = this.buildContext(job, app, profile, worker);
    try {
      await this.runPipeline(job, ctx);
    } catch (error) {
      await this.fail(job, (error as Error).message);
    } finally {
      await this.deps.registry.get(worker.providerType).cleanup(ctx).catch((error) => {
        this.deps.logger.warn(`cleanup failed for job ${job.id}`, { error: (error as Error).message });
      });
    }
  }

  private async selectWorker(job: Job, profile: BuildProfile): Promise<Worker | undefined> {
    await this.transition(job, JobStatus.SELECTING_WORKER);
    const allWorkers = await this.deps.workers.getAll();
    const outcome = await this.deps.selector.select(profile, allWorkers);
    if (!outcome.selected) {
      const reasons = outcome.rejected.map((r) => `${r.worker.name}: ${r.reason}`).join("; ") || "no workers registered";
      await this.fail(job, `No worker available for this profile. ${reasons}`);
      return undefined;
    }
    job.selectedProvider = outcome.selected.worker.providerType;
    job.selectedWorkerId = outcome.selected.worker.id;
    await this.deps.jobs.set(job);
    return outcome.selected.worker;
  }

  private buildContext(job: Job, app: BuildApp, profile: BuildProfile, worker: Worker): JobContext {
    const workDir = join(this.deps.jobsDir, job.id);
    return {
      job,
      app,
      profile,
      worker,
      workDir,
      onLog: (line) => this.deps.broadcaster.publish(job.id, line),
    };
  }

  private async runPipeline(job: Job, ctx: JobContext): Promise<void> {
    const provider = this.deps.registry.get(job.selectedProvider!);
    void provider.streamLogs(ctx).catch(() => {});

    await this.step(job, JobStatus.PREPARING, () => provider.prepareJob(ctx));
    await this.step(job, JobStatus.PREPARING, () => provider.receiveSource(ctx));
    await this.step(job, JobStatus.INSTALLING_DEPENDENCIES, () => provider.installDependencies(ctx));

    await this.transition(job, JobStatus.BUILDING);
    const buildResult = await provider.build(ctx);
    if (!buildResult.success) throw new Error(buildResult.errorMessage ?? "Build failed");

    await this.step(job, JobStatus.SIGNING, () => provider.sign(ctx));
    await this.step(job, JobStatus.TESTING, () => provider.test(ctx));

    await this.transition(job, JobStatus.EXPORTING);
    const { artifact: draft } = await provider.exportArtifact(ctx);
    await provider.returnArtifact(ctx, draft);

    await this.transition(job, JobStatus.UPLOADING_ARTIFACT);
    const artifact = await this.deps.artifactStore.persist(draft);
    await this.deps.artifacts.set(artifact);

    await this.transition(job, JobStatus.VALIDATING_ARTIFACT);
    const actualSha256 = await sha256File(artifact.filePath);
    if (actualSha256 !== artifact.sha256) {
      throw new Error(`Artifact validation failed: sha256 mismatch after copying to the artifact store`);
    }

    job.artifactId = artifact.id;
    job.finishedAt = new Date().toISOString();
    await this.transition(job, JobStatus.SUCCEEDED);
  }

  private async step(job: Job, status: Job["status"], run: () => Promise<void>): Promise<void> {
    await this.transition(job, status);
    await run();
  }

  private async transition(job: Job, status: Job["status"]): Promise<void> {
    job.status = status;
    job.updatedAt = new Date().toISOString();
    if (!job.startedAt && status !== JobStatus.QUEUED) job.startedAt = job.updatedAt;
    await this.deps.jobs.set(job);
    this.deps.broadcaster.publish(job.id, { timestamp: job.updatedAt, stream: "devdeploy", text: `Status: ${status}` });
  }

  private async fail(job: Job, message: string): Promise<void> {
    job.status = JobStatus.FAILED;
    job.errorMessage = message;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    await this.deps.jobs.set(job);
    this.deps.broadcaster.publish(job.id, { timestamp: job.updatedAt, stream: "devdeploy", text: `FAILED: ${message}` });
    this.deps.logger.error(`Job ${job.id} failed`, { message });
  }
}
