import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * A single JSON-file-backed collection of records keyed by id. Writes go through a
 * temp-file-then-rename so a crash mid-write can never leave a half-written file.
 * Deliberately simple (no native deps) so the same code runs unmodified on the Pi,
 * the Mac agent, and a Windows dev machine.
 */
export class JsonCollectionStore<T extends { id: string }> {
  private readonly filePath: string;
  private cache: Map<string, T> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, collectionName: string) {
    this.filePath = join(dataDir, `${collectionName}.json`);
  }

  private async load(): Promise<Map<string, T>> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const records: T[] = JSON.parse(raw);
      this.cache = new Map(records.map((record) => [record.id, record]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cache = new Map();
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const map = await this.load();
    const records = Array.from(map.values());
    const tmpPath = `${this.filePath}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(tmpPath, JSON.stringify(records, null, 2), "utf8");
    await rename(tmpPath, this.filePath);
  }

  /** Serializes writes so concurrent set()/delete() calls never race on the same file. */
  private enqueueWrite(mutation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(mutation, mutation);
    return this.writeQueue;
  }

  async getAll(): Promise<T[]> {
    const map = await this.load();
    return Array.from(map.values());
  }

  async get(id: string): Promise<T | undefined> {
    const map = await this.load();
    return map.get(id);
  }

  async set(record: T): Promise<void> {
    await this.enqueueWrite(async () => {
      const map = await this.load();
      map.set(record.id, record);
      await this.persist();
    });
  }

  async delete(id: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const map = await this.load();
      map.delete(id);
      await this.persist();
    });
  }
}
