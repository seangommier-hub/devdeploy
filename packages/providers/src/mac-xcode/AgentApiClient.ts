import type { JobLogLine, ProviderCapabilities, WorkerConnection } from "@devdeploy/core";

/**
 * Client for the devdeploy-agent's HTTP API, running on a paired Mac. Every call is a
 * predefined, structured operation — never an arbitrary shell command — per the
 * "no unauthenticated remote build daemon, no arbitrary remote shell" requirement.
 */
export class AgentApiClient {
  constructor(private readonly connection: WorkerConnection) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.connection.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.connection.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Agent ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  getCapabilities(): Promise<ProviderCapabilities> {
    return this.request("/capabilities");
  }

  getHealth(): Promise<{ ok: boolean; reasons: string[] }> {
    return this.request("/health");
  }

  createJob(payload: { jobId: string; gitRepoUrl: string; gitRef: string; platform: string }): Promise<void> {
    return this.request(`/jobs/${payload.jobId}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  runStep(jobId: string, step: "source" | "install" | "build" | "sign" | "test" | "export"): Promise<{ success: boolean; errorMessage?: string; artifact?: { fileName: string; sha256: string; sizeBytes: number; signed: boolean } }> {
    return this.request(`/jobs/${jobId}/steps/${step}`, { method: "POST" });
  }

  getLogsSince(jobId: string, cursor: number): Promise<{ lines: JobLogLine[]; nextCursor: number }> {
    return this.request(`/jobs/${jobId}/logs?since=${cursor}`);
  }

  cancelJob(jobId: string): Promise<void> {
    return this.request(`/jobs/${jobId}/cancel`, { method: "POST" });
  }

  downloadArtifact(jobId: string): Promise<ArrayBuffer> {
    return fetch(`${this.connection.baseUrl}/jobs/${jobId}/artifact`, {
      headers: { Authorization: `Bearer ${this.connection.apiKey}` },
    }).then((response) => {
      if (!response.ok) throw new Error(`Artifact download failed: ${response.status}`);
      return response.arrayBuffer();
    });
  }

  cleanupJob(jobId: string): Promise<void> {
    return this.request(`/jobs/${jobId}`, { method: "DELETE" });
  }
}
