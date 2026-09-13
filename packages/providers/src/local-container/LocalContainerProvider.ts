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
import { detectPackageManager, installCommand, readPackageJsonScripts } from "../local-pi/nodeProjectDetection.js";

/** Default image used for Node/web/generic builds when a profile doesn't specify one. */
const DEFAULT_BUILD_IMAGE = "node:20-bookworm-slim";

/**
 * Runs a job inside a throwaway Docker container, bind-mounting the job's isolated
 * host workspace so one app's dependency versions can never leak into another's —
 * e.g. Hearth needing a different Node version than Command Center. Source checkout
 * happens on the host (git); dependency install/build/test happen inside the container.
 */
export class LocalContainerProvider implements BuildProvider {
  readonly type = BuildProviderType.LOCAL_CONTAINER;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(private readonly jobsBaseDir: string) {}

  async detectCapabilities(_worker: Worker): Promise<ProviderCapabilities> {
    return detectLocalCapabilities(this.jobsBaseDir);
  }

  async checkHealth(_worker: Worker): Promise<HealthCheckResult> {
    const reasons: string[] = [];
    try {
      await execCommand("docker", ["info"], { cwd: this.jobsBaseDir, onLog: () => {} });
    } catch {
      reasons.push("Docker daemon not reachable (`docker info` failed)");
    }
    return {
      state: reasons.length === 0 ? "READY" : "UNAVAILABLE",
      reasons,
      checkedAt: new Date().toISOString(),
    };
  }

  canHandle(profile: BuildProfile): boolean {
    return profile.platform === Platform.WEB || profile.platform === Platform.GENERIC;
  }

  private runInContainer(ctx: JobContext, command: string[], signal?: AbortSignal): Promise<void> {
    return execCommand(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${ctx.workDir}:/workspace`,
        "-w",
        "/workspace",
        DEFAULT_BUILD_IMAGE,
        ...command,
      ],
      { cwd: ctx.workDir, onLog: ctx.onLog, signal },
    );
  }

  async prepareJob(ctx: JobContext): Promise<void> {
    await mkdir(ctx.workDir, { recursive: true });
    this.abortControllers.set(ctx.job.id, new AbortController());
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
    if (!hasPackageJson) return;
    const manager = await detectPackageManager(ctx.workDir);
    const { command, args } = installCommand(manager);
    await this.runInContainer(ctx, [command, ...args], this.abortControllers.get(ctx.job.id)?.signal);
  }

  async build(ctx: JobContext): Promise<BuildResult> {
    const { hasBuildScript } = await readPackageJsonScripts(ctx.workDir);
    if (!hasBuildScript) return { success: true };
    try {
      await this.runInContainer(ctx, ["npm", "run", "build"], this.abortControllers.get(ctx.job.id)?.signal);
      return { success: true };
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }
  }

  async sign(ctx: JobContext): Promise<void> {
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: "LOCAL_CONTAINER does not sign artifacts — nothing to do" });
  }

  async test(ctx: JobContext): Promise<void> {
    const { hasTestScript } = await readPackageJsonScripts(ctx.workDir);
    if (!hasTestScript) return;
    await this.runInContainer(ctx, ["npm", "test"], this.abortControllers.get(ctx.job.id)?.signal);
  }

  async exportArtifact(ctx: JobContext): Promise<ExportResult> {
    const artifact = await createTarGzArtifact(ctx, this.abortControllers.get(ctx.job.id)?.signal);
    return { artifact };
  }

  async returnArtifact(ctx: JobContext, artifact: Artifact): Promise<void> {
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Artifact ${artifact.fileName} ready at ${artifact.filePath}` });
  }

  async streamLogs(_ctx: JobContext): Promise<void> {
    // No-op: execCommand already pushes lines to onLog synchronously.
  }

  async cancelJob(ctx: JobContext): Promise<void> {
    this.abortControllers.get(ctx.job.id)?.abort();
  }

  async cleanup(ctx: JobContext): Promise<void> {
    this.abortControllers.delete(ctx.job.id);
    await rm(ctx.workDir, { recursive: true, force: true });
  }
}
