import { mkdir, rm } from "node:fs/promises";
import {
  BuildProviderType,
  Platform,
  type Artifact,
  type BuildProfile,
  type BuildProvider,
  type BuildResult,
  type ExportResult,
  type HealthCheckResult,
  type JobContext,
  type ProviderCapabilities,
  type Worker,
} from "@devdeploy/core";
import { execCommand } from "../shared/execCommand.js";
import { detectLocalCapabilities } from "../shared/detectLocalCapabilities.js";
import { createTarGzArtifact } from "../shared/archiveWorkDir.js";
import { detectPackageManager, installCommand, readPackageJsonScripts } from "./nodeProjectDetection.js";

/**
 * Runs a job directly on the machine DevDeploy's own server process is on (the Pi
 * itself). Handles Node/web/backend/Python projects — anything that doesn't need
 * Xcode. Each job gets its own temp workspace so one job's dependencies can never
 * collide with another's.
 */
export class LocalPiProvider implements BuildProvider {
  readonly type = BuildProviderType.LOCAL_PI;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(private readonly jobsBaseDir: string) {}

  async detectCapabilities(_worker: Worker): Promise<ProviderCapabilities> {
    return detectLocalCapabilities(this.jobsBaseDir);
  }

  async checkHealth(_worker: Worker): Promise<HealthCheckResult> {
    const capabilities = await detectLocalCapabilities(this.jobsBaseDir);
    const reasons: string[] = [];
    if (!capabilities.nodeVersion) reasons.push("Node.js not found on PATH");
    return {
      state: reasons.length === 0 ? "READY" : "DEGRADED",
      reasons,
      checkedAt: new Date().toISOString(),
    };
  }

  canHandle(profile: BuildProfile): boolean {
    return profile.platform === Platform.WEB || profile.platform === Platform.GENERIC;
  }

  async prepareJob(ctx: JobContext): Promise<void> {
    await mkdir(ctx.workDir, { recursive: true });
    this.abortControllers.set(ctx.job.id, new AbortController());
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Workspace ready at ${ctx.workDir}` });
  }

  async receiveSource(ctx: JobContext): Promise<void> {
    const signal = this.abortControllers.get(ctx.job.id)?.signal;
    await execCommand(
      "git",
      ["clone", "--branch", ctx.job.gitRef, "--depth", "1", ctx.job.gitRepoUrl, "."],
      { cwd: ctx.workDir, onLog: ctx.onLog, signal },
    );
  }

  async installDependencies(ctx: JobContext): Promise<void> {
    const { hasPackageJson } = await readPackageJsonScripts(ctx.workDir);
    if (!hasPackageJson) {
      ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: "No package.json — skipping dependency install" });
      return;
    }
    const manager = await detectPackageManager(ctx.workDir);
    const { command, args } = installCommand(manager);
    const signal = this.abortControllers.get(ctx.job.id)?.signal;
    await execCommand(command, args, { cwd: ctx.workDir, onLog: ctx.onLog, signal });
  }

  async build(ctx: JobContext): Promise<BuildResult> {
    const { hasBuildScript } = await readPackageJsonScripts(ctx.workDir);
    if (!hasBuildScript) {
      ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: "No build script — treating source as the build output" });
      return { success: true };
    }
    const signal = this.abortControllers.get(ctx.job.id)?.signal;
    try {
      await execCommand("npm", ["run", "build"], { cwd: ctx.workDir, onLog: ctx.onLog, signal });
      return { success: true };
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }
  }

  async sign(ctx: JobContext): Promise<void> {
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: "LOCAL_PI does not sign artifacts — nothing to do" });
  }

  async test(ctx: JobContext): Promise<void> {
    const { hasTestScript } = await readPackageJsonScripts(ctx.workDir);
    if (!hasTestScript) return;
    const signal = this.abortControllers.get(ctx.job.id)?.signal;
    await execCommand("npm", ["test"], { cwd: ctx.workDir, onLog: ctx.onLog, signal });
  }

  async exportArtifact(ctx: JobContext): Promise<ExportResult> {
    const signal = this.abortControllers.get(ctx.job.id)?.signal;
    const artifact = await createTarGzArtifact(ctx, signal);
    return { artifact };
  }

  async returnArtifact(ctx: JobContext, artifact: Artifact): Promise<void> {
    // Same machine — the artifact is already where the caller (JobExecutor) will read it from.
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Artifact ${artifact.fileName} ready at ${artifact.filePath}` });
  }

  async streamLogs(_ctx: JobContext): Promise<void> {
    // No-op: execCommand already pushes lines to onLog synchronously as they happen.
  }

  async cancelJob(ctx: JobContext): Promise<void> {
    this.abortControllers.get(ctx.job.id)?.abort();
  }

  async cleanup(ctx: JobContext): Promise<void> {
    this.abortControllers.delete(ctx.job.id);
    await rm(ctx.workDir, { recursive: true, force: true });
  }
}
