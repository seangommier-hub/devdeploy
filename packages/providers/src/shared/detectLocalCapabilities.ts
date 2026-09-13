import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statfs } from "node:fs/promises";
import os from "node:os";
import type { ProviderCapabilities } from "@devdeploy/core";

const execFileAsync = promisify(execFile);

async function versionOf(command: string, args: string[] = ["--version"]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout.trim().split("\n")[0];
  } catch {
    return undefined;
  }
}

/** Probes the machine DevDeploy's own process is running on for generic (non-Xcode) build tooling. */
export async function detectLocalCapabilities(workDirForDiskCheck: string): Promise<ProviderCapabilities> {
  const [nodeVersion, npmVersion, dockerVersion, gitVersion, pythonVersion] = await Promise.all([
    versionOf(process.execPath, ["--version"]),
    versionOf("npm", ["--version"]),
    versionOf("docker", ["--version"]),
    versionOf("git", ["--version"]),
    versionOf("python3", ["--version"]),
  ]);

  let diskFreeBytes: number | undefined;
  try {
    const stats = await statfs(workDirForDiskCheck);
    diskFreeBytes = stats.bavail * stats.bsize;
  } catch {
    diskFreeBytes = undefined;
  }

  const platforms = ["GENERIC", "WEB"];
  if (pythonVersion) platforms.push("GENERIC");

  return {
    platforms,
    hasDocker: Boolean(dockerVersion),
    nodeVersion,
    npmVersion,
    architecture: os.arch(),
    diskFreeBytes,
    totalMemoryBytes: os.totalmem(),
    gitVersion,
    pythonVersion,
  };
}
