# ADR-DEVDEPLOY-001: Stack, initial scope, and deployment target

Date: 2026-09-12

## Status

Accepted.

## Context

Sean asked for DevDeploy: a Raspberry Pi-based build orchestrator that
treats the Pi as a control plane, not the sole compiler — dispatching jobs
to whichever build environment (local Pi, isolated Linux container, remote
Mac/Xcode, Xcode Cloud, GitHub Actions macOS, Expo EAS) actually fits the
target platform. iOS/Xcode support is a first-class, non-optional part of
this from day one.

Per ADR-GLOBAL-002, three decision points were genuinely ambiguous enough
to resolve explicitly before scaffolding, since getting the core
abstraction wrong would mean rebuilding it later.

## Decisions

### 1. Stack: Node.js/TypeScript

**Question:** What should the Pi orchestrator server + dashboard be built
in — Node/TypeScript, Python, or something else?

**Answer:** Node/TypeScript (Claude's recommended option; Sean did not
override it when given the choice).

**Rationale:** The orchestrator has to shell out to npm/Expo/CocoaPods/
xcodebuild tooling regardless of its own implementation language, so
Node avoids a language mismatch with the tools it drives. A single
process can also serve the REST API, stream job logs over SSE/WebSocket,
and serve the dashboard without extra plumbing.

### 2. Initial scope: skeleton + real working providers, not paper
architecture

**Question:** How much should the first pass build — architecture only,
or working execution?

**Answer:** Skeleton + working providers (Claude's recommended option).

**Rationale:** The `BuildProvider` interface (`detectCapabilities`,
`checkHealth`, `prepareJob`, `build`, `exportArtifact`, `streamLogs`,
`cancelJob`, `cleanup`, etc.) must be implemented by at least one real
provider to prove the abstraction is right, not just plausible on paper.
Scope for this pass: **LOCAL_PI**, **LOCAL_CONTAINER** (Docker — already
installed and working on the target Pi, see [[reference_pi_ssh_access]]),
and **GITHUB_ACTIONS_MACOS** (reusing the exact unsigned-Xcode-build
recipe already proven working for Hearth/CardDNA — see ADR-HEARTH-031 in
`universal-remote` and ADR-186 in `sports-card-intelligence`) are real.
**MAC_XCODE** gets a first-class, real `devdeploy-agent` implementation
(capability detection, job execution, HTTP API) since Sean has a genuine
Mac to pair it to (see decision 3), but end-to-end pairing needs one
manual step from Sean (see below). REMOTE_SSH, XCODE_CLOUD, EXPO_EAS, and
GENERIC_CI are stubbed behind the same interface — correct shape,
`NOT_CONFIGURED` health status, no working execution yet.

### 3. Mac worker: MacinCloud managed remote Mac (RDP), not a local Mac

**Question:** Is there a Mac available to register as a MAC_XCODE worker?

**Answer:** Yes — Sean purchased a MacinCloud managed-server account on
2026-09-12 (see [[reference-macincloud-remote-mac]] in the
sports-card-intelligence project memory). No physical Mac exists on his
network.

**Rationale:** This directly supersedes two painful workaround paths this
year: AltServer-Linux on the Pi (ADR-HEARTH-043, confirmed dead end —
Apple's auth servers reject the client outright) and SideSign's
free-Apple-ID signing CLI on the Pi (ADR-HEARTH-044, paused on a live
`-22413` Apple fraud-detection error after real progress). Both existed
specifically because no Mac was reachable. A real Mac — even a remote,
RDP-only one — makes `xcodebuild`/CocoaPods/codesign genuinely legitimate
rather than reverse-engineered.

**Known limitation:** MacinCloud is billed by logged-in session time and
is RDP/GUI-only (no SSH access documented) — the `devdeploy-agent` install
is a **one-time manual step Sean must do himself** (RDP in via
`portal.macincloud.com` or the connection file, open Terminal, run the
agent installer/pairing command DevDeploy provides). Per ADR-GLOBAL-008,
this is the one piece that genuinely requires Sean; everything else
(capability detection, job dispatch, artifact return) is automated once
paired. Because it's billed by session time, the automatic-provider-
selection logic must never silently choose MAC_XCODE-over-MacinCloud
for background/speculative jobs without Sean's prior authorization —
mirrors the spec's "do not silently incur paid cloud-build costs" rule.

### 4. Deployment target: the existing Raspberry Pi 5 (192.168.1.172), not
a new one

**Not separately re-asked** — already established, explicitly, in a prior
session (ADR-HEARTH-043 in `universal-remote`): *"i only have the pi and
that is what it is going to run on. i am not putting it on another
computer. i can migrate to a server down the road."* Combined with
[[feedback_pi5_dev_target]] ("anything on the Family Command Center needs
to be done on the pi 5... extends the same default to Hearth"), and the
fact that Windows lacks the admin rights DevDeploy's own container/service
work would need ([[hearth-windows-not-admin]]), the orchestrator runs on
that same Pi (`192.168.1.172`, user `seangommier`, key
`~/.ssh/id_ed25519_pi` — see [[reference_pi_ssh_access]]) alongside Family
Command Center. Source is authored locally (plain text editing needs no
admin) and deployed/run on the Pi via SSH, per the standing rule.

**Accepted tradeoff:** build jobs (Docker containers, Gradle, etc.) share
the Pi's CPU/RAM/disk with the live family-facing kiosk service. Mitigated
with per-job resource limits and isolated job workspaces (see the spec's
BUILD ISOLATION section), not by provisioning separate hardware — Sean
has already declined that once. Revisit if resource contention actually
causes Family Command Center problems.

## Consequences

- Node/TypeScript monorepo under `projects/devdeploy/` (this repo),
  packages: `core`, `providers`, `server`, `agent`.
- `server` and `providers`/`core` deploy to and run on `192.168.1.172`.
- `agent` is a separately-deployable package; its target today is the
  MacinCloud Mac, paired manually once.
- GitHub Actions macOS provider reuses Hearth's/CardDNA's workflow
  pattern rather than reinventing it.

## Related

[[reference_pi_ssh_access]], [[feedback_pi5_dev_target]],
[[reference-macincloud-remote-mac]], [[hearth-windows-not-admin]],
ADR-HEARTH-031, ADR-HEARTH-043, ADR-HEARTH-044, ADR-186 (sports-card-intelligence),
ADR-GLOBAL-002, ADR-GLOBAL-003, ADR-GLOBAL-008
