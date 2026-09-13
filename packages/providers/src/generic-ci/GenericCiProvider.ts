import { BuildProviderType } from "@devdeploy/core";
import { NotConfiguredProvider } from "../shared/NotConfiguredProvider.js";

/** Fallback slot for any other legitimate CI/build provider added later (e.g. Bitrise, CircleCI). */
export class GenericCiProvider extends NotConfiguredProvider {
  readonly type = BuildProviderType.GENERIC_CI;
  protected readonly notConfiguredReason = "No generic CI provider configured.";
}
