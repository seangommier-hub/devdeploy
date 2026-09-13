import {
  AppRepository,
  ArtifactRepository,
  JobRepository,
  Logger,
  WorkerRepository,
} from "@devdeploy/core";
import {
  ExpoEasProvider,
  GenericCiProvider,
  GitHubActionsMacosProvider,
  LocalContainerProvider,
  LocalPiProvider,
  MacXcodeProvider,
  ProviderRegistry,
  ProviderSelector,
  RemoteSshProvider,
  XcodeCloudProvider,
} from "@devdeploy/providers";
import { loadConfig } from "./config/loadConfig.js";
import { createApp } from "./api/app.js";
import { JobExecutor } from "./jobs/JobExecutor.js";
import { JobQueue } from "./jobs/JobQueue.js";
import { JobLogBroadcaster } from "./jobs/JobLogBroadcaster.js";
import { ArtifactStore } from "./jobs/ArtifactStore.js";

const config = loadConfig();
const logger = new Logger("devdeploy-server");

const registry = new ProviderRegistry();
registry.register(new LocalPiProvider(config.jobsDir));
registry.register(new LocalContainerProvider(config.jobsDir));
registry.register(
  new GitHubActionsMacosProvider({ token: config.githubActionsToken, workflowFile: config.githubActionsWorkflowFile }),
);
registry.register(new MacXcodeProvider());
registry.register(new RemoteSshProvider());
registry.register(new XcodeCloudProvider());
registry.register(new ExpoEasProvider());
registry.register(new GenericCiProvider());

const deps = {
  apps: new AppRepository(config.dataDir),
  workers: new WorkerRepository(config.dataDir),
  jobs: new JobRepository(config.dataDir),
  artifacts: new ArtifactRepository(config.dataDir),
  registry,
  broadcaster: new JobLogBroadcaster(),
  artifactStore: new ArtifactStore(config.artifactsDir),
  logger,
};

const selector = new ProviderSelector(registry, logger.child("selector"));
const executor = new JobExecutor({
  registry,
  selector,
  jobs: deps.jobs,
  apps: deps.apps,
  workers: deps.workers,
  artifacts: deps.artifacts,
  artifactStore: deps.artifactStore,
  broadcaster: deps.broadcaster,
  jobsDir: config.jobsDir,
  logger: logger.child("executor"),
});
const queue = new JobQueue(executor, logger.child("queue"));

const app = createApp({ ...deps, queue, executor });

app.listen(config.port, () => {
  logger.info(`DevDeploy server listening on :${config.port}`, { dataDir: config.dataDir });
});
