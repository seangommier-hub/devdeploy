import { resolve } from "node:path";

export interface ServerConfig {
  port: number;
  dataDir: string;
  jobsDir: string;
  artifactsDir: string;
  githubActionsToken?: string;
  githubActionsWorkflowFile: string;
}

/** Reads all runtime configuration from the environment. No secrets or paths hardcoded in application code. */
export function loadConfig(): ServerConfig {
  const dataDir = resolve(process.env.DEVDEPLOY_DATA_DIR ?? "./data");
  return {
    port: Number(process.env.PORT ?? 3000),
    dataDir,
    jobsDir: resolve(dataDir, "jobs"),
    artifactsDir: resolve(dataDir, "artifacts"),
    githubActionsToken: process.env.GITHUB_ACTIONS_TOKEN,
    githubActionsWorkflowFile: process.env.GITHUB_ACTIONS_WORKFLOW_FILE ?? "ios-unsigned-build.yml",
  };
}
