import { spawn } from "node:child_process";
import type { JobLogLine } from "@devdeploy/core";

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onLog: (line: JobLogLine) => void;
  signal?: AbortSignal;
}

/** Same shape as the Pi server's execCommand — kept as its own copy since the agent ships to a separate machine. */
export function execCommand(command: string, args: string[], options: ExecOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, signal: options.signal });

    const forward = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      for (const rawLine of chunk.toString("utf8").split(/\r?\n/)) {
        if (rawLine.length === 0) continue;
        options.onLog({ timestamp: new Date().toISOString(), stream, text: rawLine });
      }
    };

    child.stdout.on("data", forward("stdout"));
    child.stderr.on("data", forward("stderr"));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/** Runs a command and captures its stdout as a string, for probing tool versions/output rather than streaming a build. */
export function execCapture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} exited ${code}`))));
  });
}
