import { Router } from "express";
import {
  generateId,
  toPublicWorker,
  type RegisterWorkerRequest,
  type Worker,
  type WorkerConnection,
  type WorkerRepository,
} from "@devdeploy/core";
import type { ProviderRegistry } from "@devdeploy/providers";

export function workersRoutes(workers: WorkerRepository, registry: ProviderRegistry): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const all = await workers.getAll();
    res.json(all.map(toPublicWorker));
  });

  router.post("/", async (req, res) => {
    const body = req.body as RegisterWorkerRequest;
    const now = new Date().toISOString();
    const worker: Worker = {
      id: generateId("worker"),
      name: body.name,
      providerType: body.providerType,
      hostname: body.hostname,
      ipAddress: body.ipAddress,
      priority: body.priority ?? 100,
      enabled: true,
      connection: body.connection as WorkerConnection | undefined,
      activeJobIds: [],
      registeredAt: now,
      updatedAt: now,
    };
    await workers.set(worker);
    res.status(201).json(toPublicWorker(worker));
  });

  router.get("/:id/health", async (req, res) => {
    const worker = await workers.get(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const provider = registry.get(worker.providerType);
    const health = await provider.checkHealth(worker);
    worker.lastHealth = health;
    await workers.set(worker);
    res.json(health);
  });

  router.get("/:id/capabilities", async (req, res) => {
    const worker = await workers.get(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const provider = registry.get(worker.providerType);
    const capabilities = await provider.detectCapabilities(worker);
    worker.capabilities = capabilities;
    await workers.set(worker);
    res.json(capabilities);
  });

  return router;
}
