import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderCapabilities } from "@devdeploy/core";
import { tryCapture } from "../shared/tryCapture.js";

export type AndroidCapabilities = Pick<ProviderCapabilities, "hasJava" | "javaHome" | "hasAndroidSdk" | "androidSdkPath">;

const MACOS_JAVA_HOME_TOOL = "/usr/libexec/java_home";
const SDK_MARKER_DIR = "build-tools";
const DEFAULT_MACOS_SDK_PATH = join(homedir(), "Library", "Android", "sdk");

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Returns the first candidate directory that contains an Android SDK (identified by its build-tools folder). */
export async function firstAndroidSdk(
  candidates: Array<string | undefined>,
  exists: (path: string) => Promise<boolean> = pathExists,
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate && (await exists(join(candidate, SDK_MARKER_DIR)))) return candidate;
  }
  return undefined;
}

/** Probes this machine for a JDK and an Android SDK — the two things a Gradle Android build needs. */
export async function detectAndroidCapabilities(): Promise<AndroidCapabilities> {
  const javaHome = process.env.JAVA_HOME || (await tryCapture(MACOS_JAVA_HOME_TOOL, []));
  const androidSdkPath = await firstAndroidSdk([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, DEFAULT_MACOS_SDK_PATH]);
  return {
    hasJava: Boolean(javaHome),
    javaHome,
    hasAndroidSdk: Boolean(androidSdkPath),
    androidSdkPath,
  };
}
