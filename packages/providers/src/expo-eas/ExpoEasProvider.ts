import { BuildProviderType } from "@devdeploy/core";
import { NotConfiguredProvider } from "../shared/NotConfiguredProvider.js";

/**
 * Expo EAS Build. Treated as one interchangeable worker, not a special case —
 * DevDeploy is not designed around it. Needs an EXPO_TOKEN configured before use.
 */
export class ExpoEasProvider extends NotConfiguredProvider {
  readonly type = BuildProviderType.EXPO_EAS;
  protected readonly notConfiguredReason =
    "Expo EAS needs an EXPO_TOKEN environment variable before it can be used.";
}
