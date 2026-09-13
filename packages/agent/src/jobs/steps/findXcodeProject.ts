import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execCapture } from "../../shared/execCommand.js";

export interface XcodeProjectRef {
  /** Path to pass to `xcodebuild -workspace` or `-project`. */
  path: string;
  isWorkspace: boolean;
  scheme: string;
}

/** Finds the generated iOS workspace/project (post `expo prebuild` or a bare RN project) and its default scheme. */
export async function findXcodeProject(iosDir: string): Promise<XcodeProjectRef> {
  const entries = await readdir(iosDir);
  const workspace = entries.find((name) => name.endsWith(".xcworkspace"));
  const project = entries.find((name) => name.endsWith(".xcodeproj"));
  const target = workspace ?? project;
  if (!target) throw new Error(`No .xcworkspace or .xcodeproj found in ${iosDir}`);

  const isWorkspace = target.endsWith(".xcworkspace");
  const path = join(iosDir, target);
  const listOutput = await execCapture(
    "xcodebuild",
    [isWorkspace ? "-workspace" : "-project", path, "-list"],
    iosDir,
  );
  const scheme = parseFirstScheme(listOutput);
  return { path, isWorkspace, scheme };
}

function parseFirstScheme(xcodebuildListOutput: string): string {
  const lines = xcodebuildListOutput.split("\n");
  const schemesIndex = lines.findIndex((line) => line.trim() === "Schemes:");
  if (schemesIndex === -1) throw new Error("Could not find a scheme via `xcodebuild -list`");
  const scheme = lines[schemesIndex + 1]?.trim();
  if (!scheme) throw new Error("`xcodebuild -list` reported no schemes");
  return scheme;
}
