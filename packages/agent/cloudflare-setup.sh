#!/usr/bin/env bash
# Run AFTER `cloudflared tunnel login` (interactive, Sean logs in himself) and
# `cloudflared tunnel create devdeploy-mac-agent` have already produced a real
# tunnel ID and its credentials file in ~/.cloudflared/. This just needs that
# ID as $1 - no other typing needed, so nothing here touches the Shift-drop
# keyboard bug (see reference-macincloud-remote-mac memory).
set -euo pipefail
TUNNEL_ID="${1:?Usage: cloudflare-setup.sh <tunnel-id>}"
CLOUDFLARED_BIN="$(command -v cloudflared)"

mkdir -p "$HOME/.cloudflared"
cat > "$HOME/.cloudflared/config.yml" <<CONFIG_EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: devdeploy-agent.carddna.app
    service: http://localhost:8443
  - service: http_status:404
CONFIG_EOF

PLIST="$HOME/Library/LaunchAgents/com.devdeploy.cloudflared.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.devdeploy.cloudflared</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CLOUDFLARED_BIN</string>
    <string>tunnel</string>
    <string>--config</string>
    <string>$HOME/.cloudflared/config.yml</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/devdeploy-cloudflared.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/devdeploy-cloudflared.log</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 3

echo "==> cloudflared tunnel running: https://devdeploy-agent.carddna.app -> localhost:8443"
tail -n 10 "$HOME/Library/Logs/devdeploy-cloudflared.log"
