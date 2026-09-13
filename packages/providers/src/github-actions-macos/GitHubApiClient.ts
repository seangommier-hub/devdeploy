import type { GitHubRepoRef } from "../shared/parseGitHubRepo.js";

const API_BASE = "https://api.github.com";

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
}

/** Thin wrapper over the GitHub REST API surface DevDeploy needs to drive a macOS Actions workflow. */
export class GitHubApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  async dispatchWorkflow(repo: GitHubRepoRef, workflowFile: string, ref: string): Promise<void> {
    await this.request(`/repos/${repo.owner}/${repo.repo}/actions/workflows/${workflowFile}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref }),
    });
  }

  /** Finds the most recent run of this workflow created at or after `sinceIso`, to match a just-dispatched run. */
  async findRunSince(repo: GitHubRepoRef, workflowFile: string, sinceIso: string): Promise<WorkflowRun | undefined> {
    const data = await this.request<{ workflow_runs: WorkflowRun[] }>(
      `/repos/${repo.owner}/${repo.repo}/actions/workflows/${workflowFile}/runs?per_page=5`,
    );
    return data.workflow_runs.find((run) => run.created_at >= sinceIso);
  }

  async getRun(repo: GitHubRepoRef, runId: number): Promise<WorkflowRun> {
    return this.request<WorkflowRun>(`/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}`);
  }

  async cancelRun(repo: GitHubRepoRef, runId: number): Promise<void> {
    await this.request(`/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/cancel`, { method: "POST" });
  }

  async listArtifacts(repo: GitHubRepoRef, runId: number): Promise<{ id: number; name: string; archive_download_url: string }[]> {
    const data = await this.request<{ artifacts: { id: number; name: string; archive_download_url: string }[] }>(
      `/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/artifacts`,
    );
    return data.artifacts;
  }

  /** Artifact downloads are zip files; returns the raw bytes for the caller to write to disk. */
  async downloadArtifactZip(downloadUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`Artifact download failed: ${response.status}`);
    }
    return response.arrayBuffer();
  }
}
