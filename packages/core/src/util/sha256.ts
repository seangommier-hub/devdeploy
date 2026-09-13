import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** Streams a file to compute its SHA-256 without loading it fully into memory — build artifacts can be large. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
