import { BuildProviderType } from "@devdeploy/core";
import { NotConfiguredProvider } from "../shared/NotConfiguredProvider.js";

/** Generic "run this on some other Linux/Windows box over SSH" provider. Architecture-only for now. */
export class RemoteSshProvider extends NotConfiguredProvider {
  readonly type = BuildProviderType.REMOTE_SSH;
  protected readonly notConfiguredReason =
    "No remote SSH worker registered yet. Register one in Settings > Build Workers.";
}
