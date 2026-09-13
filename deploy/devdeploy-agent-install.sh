#!/usr/bin/env bash
# Run this ON THE MAC ITSELF (e.g. via Terminal.app after RDP'ing into MacinCloud —
# see reference-macincloud-remote-mac memory for connection details). This is the
# one manual step a human has to do to pair a Mac worker; everything after this is
# automated from the Pi. Requires Xcode Command Line Tools and Node 20+ already
# installed (`xcode-select --install`, then Node from nodejs.org or Homebrew).
set -euo pipefail

INSTALL_DIR="$HOME/devdeploy-agent"
REPO_URL="${DEVDEPLOY_REPO_URL:?Set DEVDEPLOY_REPO_URL to this repo's GitHub URL before running}"

echo "==> Cloning DevDeploy into $INSTALL_DIR"
rm -rf "$INSTALL_DIR"
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Installing and building the agent package"
npm install
npm run build --workspace=@devdeploy/agent

API_KEY=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
PLIST="$HOME/Library/LaunchAgents/com.devdeploy.agent.plist"

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
    <string>node</string>
    <string>$INSTALL_DIR/packages/agent/dist/index.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENT_API_KEY</key><string>$API_KEY</string>
    <key>AGENT_PORT</key><string>8443</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/devdeploy-agent.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/devdeploy-agent.log</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "==> Agent installed and running on port 8443."
echo "==> Pairing details — enter these in DevDeploy's dashboard (Settings > Build Workers > Add Worker):"
echo "    Provider type: MAC_XCODE"
echo "    Base URL:      http://$(ipconfig getifaddr en0 2>/dev/null || echo THIS-MACS-IP):8443"
echo "    API key:       $API_KEY"
echo ""
echo "==> If this is a MacinCloud instance, the Pi must be able to reach that URL —"
echo "    confirm MacinCloud's firewall/network settings allow inbound connections on 8443,"
echo "    or set up a tunnel (e.g. Cloudflare Tunnel, same pattern as ADR-HEARTH-034)."
