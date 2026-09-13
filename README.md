# DevDeploy

A Raspberry Pi build orchestrator. The Pi is the control plane — job queue,
artifact store, device manager, dashboard — not the sole compiler. Every
build environment (the Pi itself, an isolated container, a real Mac running
Xcode, GitHub Actions, Xcode Cloud, Expo EAS) implements the same
`BuildProvider` interface, so the Pi can route a job to whichever one
actually fits the target platform.

See `adr/ADR-DEVDEPLOY-001-...md` for why this shape, what's real vs. stubbed
in this first pass, and where it runs.

## Status of each provider

| Provider | Status |
|---|---|
| `LOCAL_PI` | Real — runs Node/web/generic builds directly on the orchestrator host |
| `LOCAL_CONTAINER` | Real — same, isolated in a throwaway Docker container |
| `GITHUB_ACTIONS_MACOS` | Real — drives the proven unsigned-Xcode-build recipe from Hearth (ADR-HEARTH-031) / CardDNA (ADR-186) |
| `MAC_XCODE` | Real client + real agent, needs one manual pairing step on the Mac |
| `REMOTE_SSH`, `XCODE_CLOUD`, `EXPO_EAS`, `GENERIC_CI` | Architected, not implemented — `NOT_CONFIGURED` health status |

## Repo layout

```
packages/
  core/       shared types + the BuildProvider interface + JSON-file storage
  providers/  every provider implementation, the registry, and the selector
  server/     the Pi orchestrator: REST API, job queue, dashboard
  agent/      devdeploy-agent — the companion service that runs ON a Mac
deploy/       systemd unit, Pi deploy script, Mac agent install script
adr/          decisions, in this project's own words
```

## Running it

**Server (on the Pi):**
```bash
npm install
npm run build
cp .env.example .env   # fill in GITHUB_ACTIONS_TOKEN if you want that provider
node packages/server/dist/index.js
```
Dashboard: `http://<pi-ip>:3000`. Deploying to the actual Pi:
`deploy/deploy-to-pi.sh` (rsyncs, builds, and restarts the systemd service).

**Mac agent (on the Mac worker — e.g. your MacinCloud instance):**
RDP in once, open Terminal, and run `deploy/devdeploy-agent-install.sh`
(needs `DEVDEPLOY_REPO_URL` set to this repo's GitHub URL). It prints a base
URL and API key — enter those in the dashboard under Build Workers to pair
it. This is the one step that has to happen on the Mac itself; every build
after that is dispatched from the Pi.

## Known limitations (v1)

- No real Apple code-signing automation yet — `MAC_XCODE` and
  `GITHUB_ACTIONS_MACOS` both produce **unsigned** artifacts. Installing one
  still needs a sideload tool (AltStore/SideSign) or a paid Apple Developer
  account, same as before DevDeploy existed — this project automates the
  build/dispatch/artifact-management work, not Apple's own signing
  requirements.
- `LOCAL_CONTAINER` only handles Node/web/generic builds against a single
  default image (`node:20-bookworm-slim`) — no per-app image selection yet.
- Job concurrency is unbounded (one async pipeline per job, no queue depth
  limit) — fine at Sean's current scale, revisit if the Pi's shared load
  with Family Command Center ever becomes a real problem.
- The dashboard is intentionally plain (vanilla HTML/JS, no build step) to
  keep this pass's scope bounded — swap in something richer later if it's
  worth the added tooling.
