import { Router } from "express";
import type { ArtifactRepository } from "@devdeploy/core";
import type { AdbInstaller } from "../../deploy/AdbInstaller.js";

export function androidRoutes(artifacts: ArtifactRepository, installer: AdbInstaller): Router {
  const router = Router();

  router.get("/devices", async (_req, res) => {
    try {
      res.json(await installer.listDevices());
    } catch (error) {
      res.status(503).json({ error: `adb unavailable on this machine: ${(error as Error).message}` });
    }
  });

  router.post("/install/:artifactId", async (req, res) => {
    const artifact = await artifacts.get(req.params.artifactId);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    if (artifact.kind !== "apk") return res.status(400).json({ error: `Artifact is a ${artifact.kind}, not an apk` });
    try {
      const { serial } = (req.body ?? {}) as { serial?: string };
      res.json(await installer.install(artifact.filePath, serial));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
