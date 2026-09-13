import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { JobLogLine } from "@devdeploy/core";
import { execCommand } from "../../shared/execCommand.js";
import type { ArtifactMeta } from "../AgentJobStore.js";

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/**
 * Packages a built (unsigned) .app bundle into an .ipa the same way ADR-HEARTH-031's
 * proven CI recipe does: an .ipa is just a zip with the .app under a top-level
 * "Payload/" folder — no signing required to produce this, only to install it.
 */
export async function packageUnsignedIpa(
  productsDir: string,
  appName: string,
  workDir: string,
  onLog: (line: JobLogLine) => void,
): Promise<ArtifactMeta> {
  const entries = await readdir(productsDir);
  const appBundle = entries.find((name) => name.endsWith(".app"));
  if (!appBundle) throw new Error(`No .app bundle found in ${productsDir}`);

  const payloadDir = join(workDir, "Payload");
  await mkdir(payloadDir, { recursive: true });
  await execCommand("cp", ["-R", join(productsDir, appBundle), payloadDir], { cwd: workDir, onLog });

  const fileName = `${appName}-unsigned.ipa`;
  const zipPath = join(workDir, `${appName}-unsigned.zip`);
  await execCommand("zip", ["-r", "-y", zipPath, "Payload"], { cwd: workDir, onLog });
  const filePath = join(workDir, fileName);
  await rename(zipPath, filePath);

  const [sha256, stats] = await Promise.all([sha256File(filePath), stat(filePath)]);
  return { fileName, filePath, sha256, sizeBytes: stats.size, signed: false };
}
