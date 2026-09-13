import type { JobLogLine } from "@devdeploy/core";

export interface ArtifactMeta {
  fileName: string;
  filePath: string;
  sha256: string;
  sizeBytes: number;
  signed: boolean;
}

export interface AgentJob {
  id: string;
  workDir: string;
  gitRepoUrl: string;
  gitRef: string;
  logs: JobLogLine[];
  abortController: AbortController;
  artifact?: ArtifactMeta;
}

/** Holds the in-flight jobs this agent currently knows about. One agent process, many jobs over its lifetime. */
export class AgentJobStore {
  private readonly jobs = new Map<string, AgentJob>();

  create(job: AgentJob): void {
    this.jobs.set(job.id, job);
  }

  get(jobId: string): AgentJob | undefined {
    return this.jobs.get(jobId);
  }

  require(jobId: string): AgentJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}`);
    return job;
  }

  delete(jobId: string): void {
    this.jobs.delete(jobId);
  }

  appendLog(jobId: string, line: JobLogLine): void {
    this.jobs.get(jobId)?.logs.push(line);
  }
}
