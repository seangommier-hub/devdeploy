import { Router } from "express";
import { JobStatus, generateId, type AppRepository, type CreateJobRequest, type Job, type JobRepository } from "@devdeploy/core";
import type { JobQueue } from "../../jobs/JobQueue.js";
import type { JobExecutor } from "../../jobs/JobExecutor.js";
import type { JobLogBroadcaster } from "../../jobs/JobLogBroadcaster.js";

export function jobsRoutes(
  jobs: JobRepository,
  apps: AppRepository,
  queue: JobQueue,
  broadcaster: JobLogBroadcaster,
  executor: JobExecutor,
): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json((await jobs.getAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });

  router.get("/:id", async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  router.post("/", async (req, res) => {
    const body = req.body as CreateJobRequest;
    const app = await apps.get(body.appId);
    if (!app) return res.status(404).json({ error: "App not found" });
    const profile = app.profiles.find((candidate) => candidate.id === body.profileId);
    if (!profile) return res.status(404).json({ error: "Profile not found on app" });

    const now = new Date().toISOString();
    const job: Job = {
      id: generateId("job"),
      appId: app.id,
      profileId: profile.id,
      platform: profile.platform,
      status: JobStatus.QUEUED,
      allowedProviders: [],
      gitRepoUrl: app.gitRepoUrl,
      gitRef: body.gitRef ?? app.defaultBranch,
      targetDeviceId: body.targetDeviceId ?? profile.targetDeviceId,
      createdAt: now,
      updatedAt: now,
    };
    await jobs.set(job);
    queue.enqueue(job.id);
    res.status(201).json(job);
  });

  router.post("/:id/cancel", async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(await executor.cancel(job.id));
  });

  router.get("/:id/logs", async (req, res) => {
    const jobId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for (const line of broadcaster.getBuffered(jobId)) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
    const unsubscribe = broadcaster.subscribe(jobId, (line) => {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    });
    req.on("close", unsubscribe);
  });

  return router;
}
