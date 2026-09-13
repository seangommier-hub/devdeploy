import { resolve } from "node:path";
import express from "express";
import { Logger } from "@devdeploy/core";
import { apiKeyAuth } from "./auth/apiKeyAuth.js";
import { agentRoutes } from "./api/routes.js";

const logger = new Logger("devdeploy-agent");
const port = Number(process.env.AGENT_PORT ?? 8443);
const apiKey = process.env.AGENT_API_KEY;
const jobsBaseDir = resolve(process.env.AGENT_JOBS_DIR ?? "./devdeploy-jobs");

if (!apiKey) {
  logger.error("AGENT_API_KEY is not set. Generate one during pairing (see deploy/devdeploy-agent-install.sh) and set it before starting the agent.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(apiKeyAuth(apiKey));
app.use("/", agentRoutes(jobsBaseDir));

app.listen(port, () => {
  logger.info(`devdeploy-agent listening on :${port}`, { jobsBaseDir });
});
