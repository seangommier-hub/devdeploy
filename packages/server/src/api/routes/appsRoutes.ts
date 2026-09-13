import { Router } from "express";
import { generateId, type AppRepository, type BuildApp } from "@devdeploy/core";

export function appsRoutes(apps: AppRepository): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await apps.getAll());
  });

  router.get("/:id", async (req, res) => {
    const app = await apps.get(req.params.id);
    if (!app) return res.status(404).json({ error: "App not found" });
    res.json(app);
  });

  router.post("/", async (req, res) => {
    const now = new Date().toISOString();
    const body = req.body as Omit<BuildApp, "id" | "createdAt" | "updatedAt">;
    const app: BuildApp = { id: generateId("app"), createdAt: now, updatedAt: now, ...body };
    await apps.set(app);
    res.status(201).json(app);
  });

  return router;
}
