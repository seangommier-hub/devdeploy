import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BuildProviderType,
  Platform,
  generateId,
  sha256File,
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
import { AgentApiClient } from "./AgentApiClient.js";

/**
 * Talks to a real Mac running the devdeploy-agent companion service (see packages/agent).
 * DevDeploy never runs xcodebuild itself — it dispatches structured job steps to the
 * agent, which is the only thing that touches Xcode/CocoaPods/codesign. Requires the
 * worker to have been paired once (see deploy/devdeploy-agent-install.sh) — that pairing
 * is the one manual step a human has to do on the Mac itself (RDP for a MacinCloud box).
 */
export class MacXcodeProvider implements BuildProvider {
  readonly type = BuildProviderType.MAC_XCODE;
  private readonly stopStreaming = new Set<string>();

  private clientFor(worker: Worker): AgentApiClient {
    if (!worker.connection) {
      throw new Error(`Worker ${worker.name} has no agent connection — pair it first (Settings > Build Workers)`);
    }
    return new AgentApiClient(worker.connection);
  }

  async detectCapabilities(worker: Worker): Promise<ProviderCapabilities> {
    return this.clientFor(worker).getCapabilities();
  }

  async checkHealth(worker: Worker): Promise<HealthCheckResult> {
    if (!worker.connection) {
      return { state: "NOT_CONFIGURED", reasons: ["Not paired to a devdeploy-agent yet"], checkedAt: new Date().toISOString() };
    }
    try {
      const health = await this.clientFor(worker).getHealth();
      return {
        state: health.ok ? "READY" : "DEGRADED",
        reasons: health.reasons,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return { state: "UNAVAILABLE", reasons: [(error as Error).message], checkedAt: new Date().toISOString() };
    }
  }

  canHandle(profile: BuildProfile, capabilities: ProviderCapabilities): boolean {
    const platform = profile.platform;
    const isApplePlatform = platform === Platform.IOS || platform === Platform.IPADOS || platform === Platform.MACOS;
    return isApplePlatform && Boolean(capabilities.hasXcode);
  }

  async prepareJob(ctx: JobContext): Promise<void> {
    await this.clientFor(ctx.worker).createJob({
      jobId: ctx.job.id,
      gitRepoUrl: ctx.job.gitRepoUrl,
      gitRef: ctx.job.gitRef,
    });
  }

  private async runStepChecked(ctx: JobContext, step: "source" | "install" | "build" | "sign" | "test" | "export") {
    const result = await this.clientFor(ctx.worker).runStep(ctx.job.id, step);
    if (!result.success) throw new Error(result.errorMessage ?? `Step "${step}" failed on the Mac agent`);
    return result;
  }

  async receiveSource(ctx: JobContext): Promise<void> {
    await this.runStepChecked(ctx, "source");
  }

  async installDependencies(ctx: JobContext): Promise<void> {
    await this.runStepChecked(ctx, "install");
  }

  async build(ctx: JobContext): Promise<BuildResult> {
    try {
      await this.runStepChecked(ctx, "build");
      return { success: true };
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }
  }

  async sign(ctx: JobContext): Promise<void> {
    await this.runStepChecked(ctx, "sign");
  }

  async test(ctx: JobContext): Promise<void> {
    await this.runStepChecked(ctx, "test");
  }

  async exportArtifact(ctx: JobContext): Promise<ExportResult> {
    const result = await this.runStepChecked(ctx, "export");
    if (!result.artifact) throw new Error("export step did not return artifact metadata");

    const bytes = await this.clientFor(ctx.worker).downloadArtifact(ctx.job.id);
    const filePath = join(ctx.workDir, result.artifact.fileName);
    await writeFile(filePath, Buffer.from(bytes));
    const sha256 = await sha256File(filePath);
    if (sha256 !== result.artifact.sha256) {
      throw new Error(`Downloaded artifact sha256 mismatch: agent reported ${result.artifact.sha256}, got ${sha256}`);
    }

    const artifact: Artifact = {
      id: generateId("artifact"),
      jobId: ctx.job.id,
      fileName: result.artifact.fileName,
      filePath,
      sizeBytes: result.artifact.sizeBytes,
      sha256,
      kind: "ipa",
      signed: result.artifact.signed,
      createdAt: new Date().toISOString(),
    };
    return { artifact };
  }

  async returnArtifact(ctx: JobContext, artifact: Artifact): Promise<void> {
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Artifact ${artifact.fileName} downloaded from Mac agent to ${artifact.filePath}` });
  }

  async streamLogs(ctx: JobContext): Promise<void> {
    const client = this.clientFor(ctx.worker);
    let cursor = 0;
    while (!this.stopStreaming.has(ctx.job.id)) {
      try {
        const { lines, nextCursor } = await client.getLogsSince(ctx.job.id, cursor);
        for (const line of lines) ctx.onLog(line);
        cursor = nextCursor;
      } catch {
        // Transient network hiccup talking to the agent — keep polling, don't kill the job over it.
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  async cancelJob(ctx: JobContext): Promise<void> {
    this.stopStreaming.add(ctx.job.id);
    await this.clientFor(ctx.worker).cancelJob(ctx.job.id);
  }

  async cleanup(ctx: JobContext): Promise<void> {
    this.stopStreaming.add(ctx.job.id);
    await this.clientFor(ctx.worker).cleanupJob(ctx.job.id);
    this.stopStreaming.delete(ctx.job.id);
  }
}
