import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express, { type Express } from "express";
import type { AppRepository, ArtifactRepository, JobRepository, Logger, WorkerRepository } from "@devdeploy/core";
import type { ProviderRegistry } from "@devdeploy/providers";
import { appsRoutes } from "./routes/appsRoutes.js";
import { workersRoutes } from "./routes/workersRoutes.js";
import { jobsRoutes } from "./routes/jobsRoutes.js";
import { artifactsRoutes } from "./routes/artifactsRoutes.js";
import { androidRoutes } from "./routes/androidRoutes.js";
import { AdbInstaller } from "../deploy/AdbInstaller.js";
import type { JobQueue } from "../jobs/JobQueue.js";
import type { JobExecutor } from "../jobs/JobExecutor.js";
import type { JobLogBroadcaster } from "../jobs/JobLogBroadcaster.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  apps: AppRepository;
  workers: WorkerRepository;
  jobs: JobRepository;
  artifacts: ArtifactRepository;
  registry: ProviderRegistry;
  queue: JobQueue;
  executor: JobExecutor;
  broadcaster: JobLogBroadcaster;
  logger: Logger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, "..", "..", "public")));

  app.use("/api/apps", appsRoutes(deps.apps));
  app.use("/api/workers", workersRoutes(deps.workers, deps.registry));
  app.use("/api/jobs", jobsRoutes(deps.jobs, deps.apps, deps.queue, deps.broadcaster, deps.executor));
  app.use("/api/artifacts", artifactsRoutes(deps.artifacts));
  app.use("/api/android", androidRoutes(deps.artifacts, new AdbInstaller()));

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    deps.logger.error("Unhandled API error", { message: error.message });
    res.status(500).json({ error: error.message });
  });

  return app;
}
