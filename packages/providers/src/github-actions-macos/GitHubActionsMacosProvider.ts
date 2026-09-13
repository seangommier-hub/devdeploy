import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
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
import { execCommand } from "../shared/execCommand.js";
import { parseGitHubRepo } from "../shared/parseGitHubRepo.js";
import { pollUntil } from "../shared/pollUntil.js";
import { GitHubApiClient } from "./GitHubApiClient.js";

export interface GitHubActionsMacosConfig {
  /** PAT for the GitHub account that owns the target repos, scoped to `repo` + `workflow`. */
  token?: string;
  /** Workflow file name to dispatch, e.g. "ios-unsigned-build.yml" — the recipe proven in ADR-HEARTH-031. */
  workflowFile: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Dispatches a `workflow_dispatch` build to a GitHub Actions macOS runner and downloads
 * the resulting artifact. Reuses the exact unsigned-Xcode-build recipe already proven
 * working for Hearth (ADR-HEARTH-031) and CardDNA (ADR-186) — this provider does not
 * invent a new CI pattern, it drives an existing one from DevDeploy instead of by hand.
 * Produces an UNSIGNED .ipa: signing is a separate step (MAC_XCODE or a sideload tool),
 * not something this provider does.
 */
export class GitHubActionsMacosProvider implements BuildProvider {
  readonly type = BuildProviderType.GITHUB_ACTIONS_MACOS;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly runIdByJob = new Map<string, number>();

  constructor(private readonly config: GitHubActionsMacosConfig) {}

  private client(): GitHubApiClient {
    if (!this.config.token) throw new Error("GitHub Actions macOS provider has no token configured");
    return new GitHubApiClient(this.config.token);
  }

  async detectCapabilities(_worker: Worker): Promise<ProviderCapabilities> {
    return { platforms: [Platform.IOS, Platform.IPADOS] };
  }

  async checkHealth(_worker: Worker): Promise<HealthCheckResult> {
    const reasons: string[] = [];
    if (!this.config.token) reasons.push("No GitHub token configured (GITHUB_ACTIONS_TOKEN)");
    try {
      await execCommand("unzip", ["-v"], { cwd: process.cwd(), onLog: () => {} });
    } catch {
      reasons.push("`unzip` not found on PATH — needed to extract downloaded Actions artifacts");
    }
    return {
      state: reasons.length === 0 ? "READY" : "NOT_CONFIGURED",
      reasons,
      checkedAt: new Date().toISOString(),
    };
  }

  canHandle(profile: BuildProfile): boolean {
    return (
      (profile.platform === Platform.IOS || profile.platform === Platform.IPADOS) &&
      profile.distribution !== "store"
    );
  }

  async prepareJob(ctx: JobContext): Promise<void> {
    await mkdir(ctx.workDir, { recursive: true });
    this.abortControllers.set(ctx.job.id, new AbortController());
  }

  async receiveSource(_ctx: JobContext): Promise<void> {
    // No-op: the workflow itself checks out its own ref inside the GitHub Actions runner.
  }

  async installDependencies(_ctx: JobContext): Promise<void> {
    // No-op: the workflow's own steps (npm ci, pod install) handle this on the runner.
  }

  async build(ctx: JobContext): Promise<BuildResult> {
    const client = this.client();
    const repo = parseGitHubRepo(ctx.job.gitRepoUrl);
    const dispatchedAt = new Date().toISOString();
    const signal = this.abortControllers.get(ctx.job.id)?.signal;

    await client.dispatchWorkflow(repo, this.config.workflowFile, ctx.job.gitRef);
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Dispatched ${this.config.workflowFile} on ${repo.owner}/${repo.repo}@${ctx.job.gitRef}` });

    const run = await pollUntil(() => client.findRunSince(repo, this.config.workflowFile, dispatchedAt), {
      intervalMs: 5_000,
      timeoutMs: 60_000,
      signal,
    });
    this.runIdByJob.set(ctx.job.id, run.id);
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Run started: ${run.html_url}` });

    const finished = await pollUntil(
      async () => {
        const current = await client.getRun(repo, run.id);
        ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Run status: ${current.status}` });
        return current.status === "completed" ? current : undefined;
      },
      { intervalMs: this.config.pollIntervalMs ?? 15_000, timeoutMs: this.config.timeoutMs ?? 45 * 60_000, signal },
    );

    if (finished.conclusion !== "success") {
      return { success: false, errorMessage: `Workflow run concluded "${finished.conclusion}": ${finished.html_url}` };
    }
    return { success: true };
  }

  async sign(ctx: JobContext): Promise<void> {
    ctx.onLog({
      timestamp: new Date().toISOString(),
      stream: "devdeploy",
      text: "GITHUB_ACTIONS_MACOS produces an UNSIGNED artifact — signing must happen via MAC_XCODE or a sideload tool.",
    });
  }

  async test(_ctx: JobContext): Promise<void> {
    // No-op: this recipe does not run the app's test suite as part of the unsigned-build workflow.
  }

  async exportArtifact(ctx: JobContext): Promise<ExportResult> {
    const client = this.client();
    const repo = parseGitHubRepo(ctx.job.gitRepoUrl);
    const runId = this.runIdByJob.get(ctx.job.id);
    if (!runId) throw new Error("No workflow run recorded for this job — build() must run before exportArtifact()");

    const artifacts = await client.listArtifacts(repo, runId);
    const ipaArtifact = artifacts[0];
    if (!ipaArtifact) throw new Error(`Workflow run ${runId} produced no artifacts`);

    const zipBytes = await client.downloadArtifactZip(ipaArtifact.archive_download_url);
    const zipPath = join(ctx.workDir, `${ipaArtifact.name}.zip`);
    await writeFile(zipPath, Buffer.from(zipBytes));
    await execCommand("unzip", ["-o", zipPath, "-d", ctx.workDir], { cwd: ctx.workDir, onLog: ctx.onLog });

    const extracted = (await readdir(ctx.workDir)).find((name) => name.endsWith(".ipa"));
    if (!extracted) throw new Error(`No .ipa found after extracting artifact ${ipaArtifact.name}`);
    const filePath = join(ctx.workDir, extracted);
    const [sha256, stats] = await Promise.all([sha256File(filePath), stat(filePath)]);

    const artifact: Artifact = {
      id: generateId("artifact"),
      jobId: ctx.job.id,
      fileName: extracted,
      filePath,
      sizeBytes: stats.size,
      sha256,
      kind: "ipa",
      signed: false,
      createdAt: new Date().toISOString(),
    };
    return { artifact };
  }

  async returnArtifact(ctx: JobContext, artifact: Artifact): Promise<void> {
    ctx.onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text: `Artifact ${artifact.fileName} downloaded to ${artifact.filePath}` });
  }

  async streamLogs(_ctx: JobContext): Promise<void> {
    // No-op: progress is already pushed to onLog during build()'s polling loop.
  }

  async cancelJob(ctx: JobContext): Promise<void> {
    this.abortControllers.get(ctx.job.id)?.abort();
    const runId = this.runIdByJob.get(ctx.job.id);
    if (runId) {
      const repo = parseGitHubRepo(ctx.job.gitRepoUrl);
      await this.client().cancelRun(repo, runId);
    }
  }

  async cleanup(ctx: JobContext): Promise<void> {
    this.abortControllers.delete(ctx.job.id);
    this.runIdByJob.delete(ctx.job.id);
    await rm(ctx.workDir, { recursive: true, force: true });
  }
}
