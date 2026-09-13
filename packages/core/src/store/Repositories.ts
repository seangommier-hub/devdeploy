import { JsonCollectionStore } from "./JsonCollectionStore.js";
import type { Job } from "../types/Job.js";
import type { Worker } from "../types/Worker.js";
import type { Artifact } from "../types/Artifact.js";
import type { BuildApp } from "../types/BuildApp.js";

export class JobRepository extends JsonCollectionStore<Job> {
  constructor(dataDir: string) {
    super(dataDir, "jobs");
  }
}

export class WorkerRepository extends JsonCollectionStore<Worker> {
  constructor(dataDir: string) {
    super(dataDir, "workers");
  }
}

export class ArtifactRepository extends JsonCollectionStore<Artifact> {
  constructor(dataDir: string) {
    super(dataDir, "artifacts");
  }
}

export class AppRepository extends JsonCollectionStore<BuildApp> {
  constructor(dataDir: string) {
    super(dataDir, "apps");
  }
}
