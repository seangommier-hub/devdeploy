import type { BuildProviderType, Platform } from "./BuildProviderType.js";

/** One named build configuration for an app (e.g. "Development / iOS / Sean's iPhone"). */
export interface BuildProfile {
  id: string;
  name: string;
  platform: Platform;
  distribution: "development" | "internal" | "store" | "apk";
  targetDeviceId?: string;
  /** Provider priority for this profile specifically. Falls back to the app's default when empty. */
  providerPriority: BuildProviderType[];
  /** Require explicit authorization before a paid cloud provider (Xcode Cloud, EAS, MacinCloud time) can be used. */
  requireCostAuthorization: boolean;
}

/** A developer project DevDeploy knows how to build. */
export interface BuildApp {
  id: string;
  name: string;
  gitRepoUrl: string;
  defaultBranch: string;
  bundleId?: string;
  packageName?: string;
  profiles: BuildProfile[];
  createdAt: string;
  updatedAt: string;
}
