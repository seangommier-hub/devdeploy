import type { Logger } from "@devdeploy/core";
import type { JobExecutor } from "./JobExecutor.js";

/**
 * Dispatches queued jobs to the executor. Each job gets its own isolated workspace
 * and provider call chain, so jobs run concurrently rather than one at a time — the
 * isolation guarantee comes from per-job workspaces, not from serializing execution.
 */
export class JobQueue {
  constructor(
    private readonly executor: JobExecutor,
    private readonly logger: Logger,
  ) {}

  enqueue(jobId: string): void {
    void this.executor.run(jobId).catch((error) => {
      this.logger.error(`Unhandled error running job ${jobId}`, { error: (error as Error).message });
    });
  }
}
