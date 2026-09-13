import { spawn } from "node:child_process";
import type { JobLogLine } from "@devdeploy/core";

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onLog: (line: JobLogLine) => void;
  /** Redact these literal strings from every log line before emitting (API keys, tokens, passwords). */
  redact?: string[];
  signal?: AbortSignal;
}

function redactText(text: string, redact: string[] | undefined): string {
  if (!redact || redact.length === 0) return text;
  let result = text;
  for (const secret of redact) {
    if (secret) result = result.split(secret).join("***");
  }
  return result;
}

/**
 * Runs a shell command, streaming stdout/stderr to the job log line-by-line as it happens
 * (not buffered to the end) so a live job view shows real progress. Rejects on non-zero exit.
 */
export function execCommand(command: string, args: string[], options: ExecOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      signal: options.signal,
    });

    const forward = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const text = redactText(chunk.toString("utf8"), options.redact);
      for (const rawLine of text.split(/\r?\n/)) {
        if (rawLine.length === 0) continue;
        options.onLog({ timestamp: new Date().toISOString(), stream, text: rawLine });
      }
    };

    child.stdout.on("data", forward("stdout"));
    child.stderr.on("data", forward("stderr"));

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}
