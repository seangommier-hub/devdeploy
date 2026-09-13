import { tmpdir } from "node:os";
import { join } from "node:path";
import { rename, stat } from "node:fs/promises";
import { generateId, sha256File, type Artifact, type JobContext } from "@devdeploy/core";
import { execCommand } from "./execCommand.js";

/**
 * Tars up a job's workspace (minus node_modules) into a single artifact file. Shared
 * by every provider whose "artifact" is just its build output, rather than a
 * platform-specific package (IPA/APK have their own export step).
 *
 * Writes to a temp path OUTSIDE workDir first, then moves it in: GNU tar treats a
 * directory whose own size changes mid-read as an error ("file changed as we read
 * it") — which is exactly what happens if the archive is written into the same
 * directory it's archiving. `--force-local` avoids a second GNU tar quirk: without
 * it, a colon in an absolute path (e.g. Windows' `C:\...`) is parsed as `host:path`
 * remote-tar syntax rather than a local drive letter.
 */
export async function createTarGzArtifact(ctx: JobContext, signal?: AbortSignal): Promise<Artifact> {
  const fileName = `${ctx.job.id}.tar.gz`;
  const tempArchivePath = join(tmpdir(), fileName);
  await execCommand("tar", ["--exclude=node_modules", "--force-local", "-czf", tempArchivePath, "."], {
    cwd: ctx.workDir,
    onLog: ctx.onLog,
    signal,
  });
  const archivePath = join(ctx.workDir, fileName);
  await rename(tempArchivePath, archivePath);
  const [sha256, stats] = await Promise.all([sha256File(archivePath), stat(archivePath)]);
  return {
    id: generateId("artifact"),
    jobId: ctx.job.id,
    fileName,
    filePath: archivePath,
    sizeBytes: stats.size,
    sha256,
    kind: "other",
    signed: false,
    createdAt: new Date().toISOString(),
  };
}
