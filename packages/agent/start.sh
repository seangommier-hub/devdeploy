#!/usr/bin/env bash
# Starts the agent with AGENT_API_KEY/AGENT_PORT set, persisting the key across
# restarts. Exists so the Mac's own invocation only ever needs `bash start.sh` -
# every uppercase/symbol character the process actually needs lives in this file,
# not typed at a keyboard (see reference-macincloud-remote-mac memory: this Mac's
# remote keyboard input drops the Shift modifier, corrupting anything typed that
# needs it).
set -euo pipefail
cd "$(dirname "$0")"

# launchd's own PATH is minimal (/usr/bin:/bin:/usr/sbin:/sbin) and doesn't
# include Homebrew or nvm install locations - add the common ones so `node`
# resolves the same way here as it does in an interactive shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/current/bin:$PATH"

# launchd also starts with no locale set at all, which breaks CocoaPods/Ruby
# ("Unicode Normalization not appropriate for ASCII-8BIT") - confirmed live
# 2026-09-13 on a real `pod install` run dispatched through this agent.
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

KEY_FILE=".agent-api-key"
if [ ! -f "$KEY_FILE" ]; then
  openssl rand -hex 32 > "$KEY_FILE"
fi

export AGENT_API_KEY="$(cat "$KEY_FILE")"
export AGENT_PORT="${AGENT_PORT:-8443}"

echo "Base URL: http://$(ipconfig getifaddr en0 2>/dev/null || echo THIS-MACS-IP):$AGENT_PORT"
echo "API key:  $AGENT_API_KEY"

exec node dist/index.js
