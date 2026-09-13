#!/usr/bin/env bash
# Downloads the cloudflared binary into the user's own directory - no admin
# rights needed. Run this BEFORE `cloudflared tunnel login`/`tunnel create`,
# since those need the binary to exist first. See cloudflare-setup.sh for the
# step that runs after those two (Sean logs in himself, interactively).
set -euo pipefail

LOCAL_BIN="$HOME/.local/bin"
CLOUDFLARED_BIN="$LOCAL_BIN/cloudflared"
mkdir -p "$LOCAL_BIN"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ASSET="cloudflared-darwin-arm64.tgz" ;;
  *) ASSET="cloudflared-darwin-amd64.tgz" ;;
esac

echo "==> Downloading cloudflared ($ASSET) into $LOCAL_BIN"
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$ASSET" -o /tmp/cloudflared.tgz
tar -xzf /tmp/cloudflared.tgz -C "$LOCAL_BIN"
chmod 755 "$CLOUDFLARED_BIN"
rm -f /tmp/cloudflared.tgz

echo "==> Installed. Run these next (Sean logs in himself in the browser this opens):"
echo "    $CLOUDFLARED_BIN tunnel login"
echo "    $CLOUDFLARED_BIN tunnel create devdeploy-mac-agent"
"$CLOUDFLARED_BIN" --version
