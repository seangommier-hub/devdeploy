import { Router } from "express";
import type { ArtifactRepository } from "@devdeploy/core";

export function artifactsRoutes(artifacts: ArtifactRepository): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await artifacts.getAll());
  });

  router.get("/:id/download", async (req, res) => {
    const artifact = await artifacts.get(req.params.id);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    res.download(artifact.filePath, artifact.fileName);
  });

  return router;
}
