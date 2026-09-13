import {
  ProviderNotImplementedError,
  type BuildProvider,
  type BuildProviderType,
  type BuildResult,
  type ExportResult,
  type HealthCheckResult,
  type JobContext,
  type ProviderCapabilities,
  type Worker,
} from "@devdeploy/core";

/**
 * Base for a provider type that is architecturally first-class (appears in every
 * selection/priority list, has a real capability shape) but has no working
 * implementation yet. checkHealth always reports NOT_CONFIGURED with a clear reason
 * instead of pretending to be a candidate the selector could pick.
 */
export abstract class NotConfiguredProvider implements BuildProvider {
  abstract readonly type: BuildProviderType;
  protected abstract readonly notConfiguredReason: string;

  async detectCapabilities(_worker: Worker): Promise<ProviderCapabilities> {
    return { platforms: [] };
  }

  async checkHealth(_worker: Worker): Promise<HealthCheckResult> {
    return {
      state: "NOT_CONFIGURED",
      reasons: [this.notConfiguredReason],
      checkedAt: new Date().toISOString(),
    };
  }

  canHandle(): boolean {
    return false;
  }

  async prepareJob(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "prepareJob");
  }

  async receiveSource(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "receiveSource");
  }

  async installDependencies(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "installDependencies");
  }

  async build(): Promise<BuildResult> {
    throw new ProviderNotImplementedError(this.type, "build");
  }

  async sign(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "sign");
  }

  async test(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "test");
  }

  async exportArtifact(): Promise<ExportResult> {
    throw new ProviderNotImplementedError(this.type, "exportArtifact");
  }

  async returnArtifact(): Promise<void> {
    throw new ProviderNotImplementedError(this.type, "returnArtifact");
  }

  async streamLogs(_ctx: JobContext): Promise<void> {
    // No-op: a provider with no working execution has nothing to stream.
  }

  async cancelJob(): Promise<void> {
    // No-op: nothing can be running against a NOT_CONFIGURED provider.
  }

  async cleanup(): Promise<void> {
    // No-op.
  }
}
