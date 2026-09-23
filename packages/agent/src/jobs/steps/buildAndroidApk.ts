import { access } from "node:fs/promises";
import { join } from "node:path";
import type { JobLogLine } from "@devdeploy/core";
import { detectAndroidCapabilities } from "../../capabilities/detectAndroidCapabilities.js";
import { execCommand } from "../../shared/execCommand.js";

export interface AndroidBuildOptions {
  workDir: string;
  onLog: (line: JobLogLine) => void;
  signal?: AbortSignal;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Generates the native android/ project from the Expo config when the repo doesn't already track one. */
async function ensureAndroidProject({ workDir, onLog, signal }: AndroidBuildOptions): Promise<string> {
  const androidDir = join(workDir, "android");
  if (!(await exists(androidDir)) && (await exists(join(workDir, "app.json")))) {
    await execCommand("npx", ["expo", "prebuild", "--platform", "android"], {
      cwd: workDir,
      env: { ...process.env, CI: "1" },
      onLog,
      signal,
    });
  }
  return androidDir;
}

/**
 * Builds the release APK with Gradle. Expo's prebuilt android project signs the release
 * variant with its template debug keystore, so the result installs without keystore
 * management (see ADR-DEVDEPLOY-002).
 */
export async function buildAndroidApk(options: AndroidBuildOptions): Promise<void> {
  const androidDir = await ensureAndroidProject(options);
  const { javaHome, androidSdkPath } = await detectAndroidCapabilities();
  if (!javaHome || !androidSdkPath) {
    throw new Error("This agent has no JDK and/or Android SDK — cannot build Android (check capabilities)");
  }
  await execCommand("sh", ["./gradlew", "assembleRelease", "--no-daemon"], {
    cwd: androidDir,
    env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidSdkPath, ANDROID_SDK_ROOT: androidSdkPath },
    onLog: options.onLog,
    signal: options.signal,
  });
}
