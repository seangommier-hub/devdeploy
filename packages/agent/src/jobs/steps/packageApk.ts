import { copyFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "@devdeploy/core";
import type { ArtifactMeta } from "../AgentJobStore.js";

const APK_OUTPUT_DIR = ["android", "app", "build", "outputs", "apk", "release"];

/** Picks the installable APK: a "-unsigned" one can't be installed, so it only wins if nothing else exists. */
export function pickApk(fileNames: string[]): string | undefined {
  const apks = fileNames.filter((name) => name.endsWith(".apk"));
  return apks.find((name) => !name.includes("unsigned")) ?? apks[0];
}

/** Copies the built APK next to the job's other output and describes it for the server to download. */
export async function packageApk(workDir: string, appName: string): Promise<ArtifactMeta> {
  const outputDir = join(workDir, ...APK_OUTPUT_DIR);
  const apkName = pickApk(await readdir(outputDir));
  if (!apkName) throw new Error(`No .apk found in ${outputDir}`);

  const fileName = `${appName}-release.apk`;
  const filePath = join(workDir, fileName);
  await copyFile(join(outputDir, apkName), filePath);

  const [sha256, stats] = await Promise.all([sha256File(filePath), stat(filePath)]);
  return { fileName, filePath, sha256, sizeBytes: stats.size, signed: false };
}
