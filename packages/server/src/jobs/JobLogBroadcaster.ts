import { EventEmitter } from "node:events";
import type { JobLogLine } from "@devdeploy/core";

/** In-memory pub/sub of a job's log lines, so the dashboard can stream them live over SSE. */
export class JobLogBroadcaster {
  private readonly emitter = new EventEmitter();
  private readonly buffers = new Map<string, JobLogLine[]>();

  publish(jobId: string, line: JobLogLine): void {
    const buffer = this.buffers.get(jobId) ?? [];
    buffer.push(line);
    this.buffers.set(jobId, buffer);
    this.emitter.emit(jobId, line);
  }

  getBuffered(jobId: string): JobLogLine[] {
    return this.buffers.get(jobId) ?? [];
  }

  subscribe(jobId: string, onLine: (line: JobLogLine) => void): () => void {
    this.emitter.on(jobId, onLine);
    return () => this.emitter.off(jobId, onLine);
  }

  clear(jobId: string): void {
    this.buffers.delete(jobId);
  }
}
