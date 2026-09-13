const workersCards = document.getElementById("workers-cards");
const appsCards = document.getElementById("apps-cards");
const jobsBody = document.getElementById("jobs-body");
const logPanel = document.getElementById("log-panel");
const logJobId = document.getElementById("log-job-id");
const serverStatus = document.getElementById("server-status");

let activeLogSource = null;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
}

function renderWorkers(workers) {
  if (workers.length === 0) {
    workersCards.innerHTML = '<p class="muted">No workers registered yet.</p>';
    return;
  }
  workersCards.innerHTML = workers
    .map((worker) => {
      const state = worker.lastHealth ? worker.lastHealth.state : "NOT_CONFIGURED";
      return `<div class="card">
        <h3>${worker.name}</h3>
        <p class="muted">${worker.providerType}</p>
        <span class="badge ${state}">${state}</span>
      </div>`;
    })
    .join("");
}

function renderApps(apps) {
  if (apps.length === 0) {
    appsCards.innerHTML = '<p class="muted">No apps configured yet.</p>';
    return;
  }
  appsCards.innerHTML = apps
    .map(
      (app) => `<div class="card">
        <h3>${app.name}</h3>
        <p class="muted">${app.profiles.length} profile(s)</p>
      </div>`,
    )
    .join("");
}

function renderJobs(jobs, appsById) {
  jobsBody.innerHTML = jobs
    .map((job) => {
      const appName = appsById.get(job.appId)?.name ?? job.appId;
      return `<tr class="job-row" data-job-id="${job.id}">
        <td>${job.id}</td>
        <td>${appName}</td>
        <td>${job.selectedProvider ?? "-"}</td>
        <td><span class="badge ${job.status}">${job.status}</span></td>
        <td>${new Date(job.createdAt).toLocaleString()}</td>
      </tr>`;
    })
    .join("");

  jobsBody.querySelectorAll(".job-row").forEach((row) => {
    row.addEventListener("click", () => streamLog(row.dataset.jobId));
  });
}

function streamLog(jobId) {
  if (activeLogSource) activeLogSource.close();
  logPanel.textContent = "";
  logJobId.textContent = `(${jobId})`;
  activeLogSource = new EventSource(`/api/jobs/${jobId}/logs`);
  activeLogSource.onmessage = (event) => {
    const line = JSON.parse(event.data);
    logPanel.textContent += `[${line.stream}] ${line.text}\n`;
    logPanel.scrollTop = logPanel.scrollHeight;
  };
}

async function refresh() {
  try {
    const [workers, apps, jobs] = await Promise.all([
      fetchJson("/api/workers"),
      fetchJson("/api/apps"),
      fetchJson("/api/jobs"),
    ]);
    renderWorkers(workers);
    renderApps(apps);
    renderJobs(jobs, new Map(apps.map((app) => [app.id, app])));
    serverStatus.textContent = "connected";
  } catch (error) {
    serverStatus.textContent = `error: ${error.message}`;
  }
}

refresh();
setInterval(refresh, 5000);
