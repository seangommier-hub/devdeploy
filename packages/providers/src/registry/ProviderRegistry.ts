import type { BuildProvider, BuildProviderType } from "@devdeploy/core";

/** Holds one BuildProvider instance per provider type. The rest of DevDeploy never imports a concrete provider directly. */
export class ProviderRegistry {
  private readonly providers = new Map<BuildProviderType, BuildProvider>();

  register(provider: BuildProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: BuildProviderType): BuildProvider {
    const provider = this.providers.get(type);
    if (!provider) throw new Error(`No provider registered for type ${type}`);
    return provider;
  }

  getAll(): BuildProvider[] {
    return Array.from(this.providers.values());
  }
}
