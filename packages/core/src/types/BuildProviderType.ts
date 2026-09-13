/** Every kind of build environment DevDeploy knows how to dispatch a job to. */
export const BuildProviderType = {
  LOCAL_PI: "LOCAL_PI",
  LOCAL_CONTAINER: "LOCAL_CONTAINER",
  REMOTE_SSH: "REMOTE_SSH",
  MAC_XCODE: "MAC_XCODE",
  XCODE_CLOUD: "XCODE_CLOUD",
  GITHUB_ACTIONS_MACOS: "GITHUB_ACTIONS_MACOS",
  EXPO_EAS: "EXPO_EAS",
  GENERIC_CI: "GENERIC_CI",
} as const;

export type BuildProviderType = (typeof BuildProviderType)[keyof typeof BuildProviderType];

/** Platforms a job can target. Providers declare which of these they can build. */
export const Platform = {
  IOS: "IOS",
  IPADOS: "IPADOS",
  ANDROID: "ANDROID",
  MACOS: "MACOS",
  WEB: "WEB",
  GENERIC: "GENERIC",
} as const;

export type Platform = (typeof Platform)[keyof typeof Platform];
