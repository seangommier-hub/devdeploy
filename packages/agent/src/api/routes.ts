import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Router } from "express";
import { detectMacCapabilities } from "../capabilities/detectMacCapabilities.js";
import { AgentJobStore } from "../jobs/AgentJobStore.js";
import { JobRunner } from "../jobs/JobRunner.js";

type Step = "source" | "install" | "build" | "sign" | "test" | "export";

export function agentRoutes(jobsBaseDir: string): Router {
  const router = Router();
  const store = new AgentJobStore();
  const runner = new JobRunner(store);

  router.get("/capabilities", async (_req, res) => {
    res.json(await detectMacCapabilities());
  });

  router.get("/health", async (_req, res) => {
    const capabilities = await detectMacCapabilities();
    const reasons: string[] = [];
    if (!capabilities.hasXcode) reasons.push("Xcode not found (xcode-select -p failed)");
    if (!capabilities.signingReady) reasons.push("No codesigning identity found — builds will be unsigned");
    res.json({ ok: !reasons.some((r) => r.startsWith("Xcode")), reasons });
  });

  router.put("/jobs/:id", async (req, res) => {
    const { gitRepoUrl, gitRef } = req.body as { gitRepoUrl: string; gitRef: string };
    const workDir = join(jobsBaseDir, req.params.id);
    await mkdir(workDir, { recursive: true });
    store.create({ id: req.params.id, workDir, gitRepoUrl, gitRef, logs: [], abortController: new AbortController() });
    res.status(201).json({ ok: true });
  });

  router.post("/jobs/:id/steps/:step", async (req, res) => {
    const job = store.require(req.params.id);
    const step = req.params.step as Step;
    try {
      await runStep(runner, job, step);
      res.json({ success: true, artifact: step === "export" ? job.artifact : undefined });
    } catch (error) {
      res.json({ success: false, errorMessage: (error as Error).message });
    }
  });

  router.get("/jobs/:id/logs", (req, res) => {
    const job = store.require(req.params.id);
    const since = Number(req.query.since ?? 0);
    res.json({ lines: job.logs.slice(since), nextCursor: job.logs.length });
  });

  router.post("/jobs/:id/cancel", (req, res) => {
    store.require(req.params.id).abortController.abort();
    res.status(204).end();
  });

  router.get("/jobs/:id/artifact", async (req, res) => {
    const job = store.require(req.params.id);
    if (!job.artifact) return res.status(404).json({ error: "No artifact produced yet" });
    res.send(await readFile(job.artifact.filePath));
  });

  router.delete("/jobs/:id", async (req, res) => {
    const job = store.get(req.params.id);
    if (job) {
      await rm(job.workDir, { recursive: true, force: true });
      store.delete(job.id);
    }
    res.status(204).end();
  });

  return router;
}

function runStep(runner: JobRunner, job: Parameters<JobRunner["runSource"]>[0], step: Step): Promise<void> {
  switch (step) {
    case "source":
      return runner.runSource(job);
    case "install":
      return runner.runInstall(job);
    case "build":
      return runner.runBuild(job);
    case "sign":
      return runner.runSign(job);
    case "test":
      return runner.runTest(job);
    case "export":
      return runner.runExport(job);
  }
}
