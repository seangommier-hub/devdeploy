import type { ProviderCapabilities } from "@devdeploy/core";
import { tryCapture } from "../shared/tryCapture.js";
import { detectAndroidCapabilities } from "./detectAndroidCapabilities.js";

/** Probes this Mac for everything the spec asks DevDeploy to detect: Xcode, SDKs, signing, CocoaPods, disk/RAM. */
export async function detectMacCapabilities(): Promise<ProviderCapabilities> {
  const [macOsVersion, architecture, xcodePath, xcodeVersion, iosSdkVersion, podVersion, nodeVersion, signingIdentitiesRaw] =
    await Promise.all([
      tryCapture("sw_vers", ["-productVersion"]),
      tryCapture("uname", ["-m"]),
      tryCapture("xcode-select", ["-p"]),
      tryCapture("xcodebuild", ["-version"]),
      tryCapture("xcrun", ["--sdk", "iphoneos", "--show-sdk-version"]),
      tryCapture("pod", ["--version"]),
      tryCapture(process.execPath, ["--version"]),
      tryCapture("security", ["find-identity", "-v", "-p", "codesigning"]),
    ]);

  const android = await detectAndroidCapabilities();
  const signingIdentities = (signingIdentitiesRaw ?? "")
    .split("\n")
    .filter((line) => line.includes(")"))
    .map((line) => line.trim());

  return {
    platforms: [...(xcodePath ? ["IOS", "IPADOS", "MACOS"] : []), ...(android.hasAndroidSdk && android.hasJava ? ["ANDROID"] : [])],
    hasXcode: Boolean(xcodePath),
    xcodeVersions: xcodeVersion ? [xcodeVersion.split("\n")[0]] : [],
    selectedXcodeVersion: xcodeVersion?.split("\n")[0],
    iosSdkVersions: iosSdkVersion ? [iosSdkVersion] : [],
    signingReady: signingIdentities.length > 0,
    signingIdentities,
    hasCocoaPods: Boolean(podVersion),
    cocoaPodsVersion: podVersion,
    hasSwiftPackageManager: Boolean(xcodePath),
    ...android,
    nodeVersion,
    macOsVersion,
    architecture,
  };
}
