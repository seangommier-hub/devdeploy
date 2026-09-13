import { randomUUID } from "node:crypto";

/** Generates a prefixed id (e.g. "job_3f9c1a2b...") so ids are self-describing in logs and URLs. */
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
