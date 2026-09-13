#!/usr/bin/env bash
# Run this ON THE MAC ITSELF (e.g. via Terminal.app after RDP'ing into MacinCloud —
# see reference-macincloud-remote-mac memory for connection details). This is the
# one manual step a human has to do to pair a Mac worker; everything after this is
# automated from the Pi. Requires Xcode Command Line Tools and Node 20+ already
# installed (`xcode-select --install`, then Node from nodejs.org or Homebrew).
set -euo pipefail

INSTALL_DIR="$HOME/devdeploy-agent"
# Defaults to this project's own repo so the common case needs no env var at all
# (still overridable for a fork/mirror). Positional $1 is also accepted.
REPO_URL="${1:-${DEVDEPLOY_REPO_URL:-https://github.com/seangommier-hub/devdeploy}}"

echo "==> Cloning DevDeploy into $INSTALL_DIR"
rm -rf "$INSTALL_DIR"
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Installing and building the agent package"
npm install
npm run build --workspace=@devdeploy/core
npm run build --workspace=@devdeploy/agent

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS_DIR/com.devdeploy.agent.plist"
mkdir -p "$LAUNCH_AGENTS_DIR" "$HOME/Library/Logs"

echo "==> Writing launchd job so the agent starts automatically at login"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.devdeploy.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>bash</string>
    <string>$INSTALL_DIR/packages/agent/start.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/devdeploy-agent.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/devdeploy-agent.log</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 2

echo ""
echo "==> Agent installed and running on port 8443 (see $INSTALL_DIR/packages/agent/.agent-api-key)."
echo "==> Pairing details — enter these in DevDeploy's dashboard (Settings > Build Workers > Add Worker):"
echo "    Provider type: MAC_XCODE"
tail -n 5 "$HOME/Library/Logs/devdeploy-agent.log"
echo ""
echo "==> If this is a MacinCloud instance, the Pi must be able to reach that URL —"
echo "    confirm MacinCloud's firewall/network settings allow inbound connections on 8443,"
echo "    or set up a tunnel (e.g. Cloudflare Tunnel, same pattern as ADR-HEARTH-034)."
