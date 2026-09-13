import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { JobLogLine } from "@devdeploy/core";
import { execCommand } from "../shared/execCommand.js";
import { findXcodeProject } from "./steps/findXcodeProject.js";
import { packageUnsignedIpa } from "./steps/packageUnsignedIpa.js";
import { patchExpoModulesJsi } from "./steps/patchExpoModulesJsi.js";
import type { AgentJob, AgentJobStore } from "./AgentJobStore.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function appName(workDir: string): Promise<string> {
  try {
    const raw = await readFile(join(workDir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name ?? "App";
  } catch {
    return "App";
  }
}

/**
 * Executes the real iOS build pipeline on this Mac: source -> install -> (expo
 * prebuild if needed) -> pod install -> xcodebuild -> package. This is the only
 * code on the whole Mac that touches Xcode/CocoaPods, driven entirely by the
 * agent's HTTP API — never an arbitrary shell command from the Pi.
 */
export class JobRunner {
  constructor(private readonly store: AgentJobStore) {}

  private log(job: AgentJob, text: string): void {
    this.store.appendLog(job.id, { timestamp: new Date().toISOString(), stream: "devdeploy", text });
  }

  async runSource(job: AgentJob): Promise<void> {
    await execCommand(
      "git",
      ["clone", "--branch", job.gitRef, "--depth", "1", job.gitRepoUrl, "."],
      { cwd: job.workDir, onLog: (line) => this.store.appendLog(job.id, line), signal: job.abortController.signal },
    );
  }

  async runInstall(job: AgentJob): Promise<void> {
    if (!(await exists(join(job.workDir, "package.json")))) {
      this.log(job, "No package.json — skipping npm install");
      return;
    }
    await execCommand("npm", ["ci"], { cwd: job.workDir, onLog: (line) => this.store.appendLog(job.id, line), signal: job.abortController.signal });
  }

  private async removeDevClient(job: AgentJob): Promise<void> {
    // expo-dev-client/-menu/-launcher are development-only (connecting to a live Metro
    // server) and pull in asset catalogs that can need a matching iOS Simulator runtime
    // — not needed for this standalone Release build. Same removal as ADR-HEARTH-031's
    // proven CI recipe (universal-remote repo).
    for (const pkg of ["expo-dev-client", "expo-dev-menu", "expo-dev-launcher"]) {
      await rm(join(job.workDir, "node_modules", pkg), { recursive: true, force: true });
    }
  }

  private async ensureIosProject(job: AgentJob): Promise<string> {
    const iosDir = join(job.workDir, "ios");
    const onLog = (line: JobLogLine) => this.store.appendLog(job.id, line);
    if (!(await exists(iosDir)) && (await exists(join(job.workDir, "app.json")))) {
      await this.removeDevClient(job);
      await patchExpoModulesJsi(job.workDir, onLog);
      this.log(job, "No ios/ directory — running expo prebuild");
      await execCommand("npx", ["expo", "prebuild", "--platform", "ios", "--non-interactive"], {
        cwd: job.workDir,
        onLog,
        signal: job.abortController.signal,
      });
    }
    if (await exists(join(iosDir, "Podfile"))) {
      await execCommand("pod", ["install"], { cwd: iosDir, onLog, signal: job.abortController.signal });
    }
    return iosDir;
  }

  async runBuild(job: AgentJob): Promise<void> {
    const iosDir = await this.ensureIosProject(job);
    const { path, isWorkspace, scheme } = await findXcodeProject(iosDir);
    this.log(job, `Building scheme "${scheme}" from ${path}`);
    await execCommand(
      "xcodebuild",
      [
        isWorkspace ? "-workspace" : "-project",
        path,
        "-scheme",
        scheme,
        "-configuration",
        "Release",
        "-sdk",
        "iphoneos",
        "-derivedDataPath",
        join(job.workDir, "build"),
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ],
      { cwd: iosDir, onLog: (line) => this.store.appendLog(job.id, line), signal: job.abortController.signal },
    );
  }

  async runSign(job: AgentJob): Promise<void> {
    this.log(job, "No signing identity/provisioning automation configured yet — producing an unsigned artifact. Pair with a sideload tool (AltStore/SideSign) or a paid Apple Developer profile to install.");
  }

  async runTest(_job: AgentJob): Promise<void> {
    // Not implemented in v1 — the unsigned-build recipe this mirrors (ADR-HEARTH-031) does not run app tests either.
  }

  async runExport(job: AgentJob): Promise<void> {
    const productsDir = join(job.workDir, "build", "Build", "Products", "Release-iphoneos");
    const name = await appName(job.workDir);
    const onLog = (line: JobLogLine) => this.store.appendLog(job.id, line);
    job.artifact = await packageUnsignedIpa(productsDir, name, job.workDir, onLog);
  }
}
