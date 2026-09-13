import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact } from "@devdeploy/core";

/**
 * Moves a provider's just-produced artifact out of its job-specific (soon to be
 * deleted) workspace and into DevDeploy's permanent, job-independent artifact store.
 */
export class ArtifactStore {
  constructor(private readonly artifactsDir: string) {}

  async persist(draft: Artifact): Promise<Artifact> {
    const targetDir = join(this.artifactsDir, draft.id);
    await mkdir(targetDir, { recursive: true });
    const targetPath = join(targetDir, draft.fileName);
    await copyFile(draft.filePath, targetPath);
    return { ...draft, filePath: targetPath };
  }
}
