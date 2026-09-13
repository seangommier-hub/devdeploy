import { BuildProviderType } from "@devdeploy/core";
import { NotConfiguredProvider } from "../shared/NotConfiguredProvider.js";

/**
 * Apple Xcode Cloud. Apple does not expose a public API to trigger/monitor builds
 * directly (as of this writing) — only App Store Connect's workflow configuration
 * and CI status are reachable through supported channels, and even those require
 * an App Store Connect API key DevDeploy doesn't have configured yet. Architected
 * as first-class so the moment that key exists, this provider can be filled in
 * without touching the job-selection logic.
 */
export class XcodeCloudProvider extends NotConfiguredProvider {
  readonly type = BuildProviderType.XCODE_CLOUD;
  protected readonly notConfiguredReason =
    "Xcode Cloud needs an App Store Connect API key (Settings > Build Workers > Xcode Cloud) before it can be used.";
}
