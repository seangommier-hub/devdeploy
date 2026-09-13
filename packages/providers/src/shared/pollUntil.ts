export interface PollOptions {
  intervalMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Repeatedly calls `check` until it returns a value (not undefined) or the timeout/abort fires. */
export async function pollUntil<T>(check: () => Promise<T | undefined>, options: PollOptions): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error("Polling aborted");
    const result = await check();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
  throw new Error(`Timed out after ${options.timeoutMs}ms waiting for condition`);
}
