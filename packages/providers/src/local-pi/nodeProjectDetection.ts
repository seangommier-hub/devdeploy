import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export type NodePackageManager = "npm" | "yarn" | "pnpm";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Picks the package manager whose lockfile is present, defaulting to npm. */
export async function detectPackageManager(projectDir: string): Promise<NodePackageManager> {
  if (await exists(join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(projectDir, "yarn.lock"))) return "yarn";
  return "npm";
}

export function installCommand(manager: NodePackageManager): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["install", "--frozen-lockfile"] };
    case "yarn":
      return { command: "yarn", args: ["install", "--frozen-lockfile"] };
    default:
      return { command: "npm", args: ["ci"] };
  }
}

export interface PackageJsonScripts {
  hasBuildScript: boolean;
  hasTestScript: boolean;
  hasPackageJson: boolean;
}

/** Reads package.json (if any) to find out which npm scripts actually exist, so we never guess. */
export async function readPackageJsonScripts(projectDir: string): Promise<PackageJsonScripts> {
  const packageJsonPath = join(projectDir, "package.json");
  if (!(await exists(packageJsonPath))) {
    return { hasBuildScript: false, hasTestScript: false, hasPackageJson: false };
  }
  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  const scripts = parsed.scripts ?? {};
  return {
    hasBuildScript: typeof scripts.build === "string",
    hasTestScript: typeof scripts.test === "string",
    hasPackageJson: true,
  };
}
