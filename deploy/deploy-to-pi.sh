#!/usr/bin/env bash
# Syncs this repo to the Pi, installs/builds it, and (re)starts the systemd service.
# Run from a Windows Git Bash / WSL / any POSIX shell with the Pi's SSH key available.
# Uses tar-over-ssh rather than rsync — no rsync binary needed on the sending side
# (Windows Git Bash doesn't ship one), just tar + ssh, both already present.
set -euo pipefail

PI_HOST="seangommier@192.168.1.172"
PI_SSH_KEY="${PI_SSH_KEY:-$HOME/.ssh/id_ed25519_pi}"
REMOTE_DIR="/home/seangommier/devdeploy"

SSH="ssh -i $PI_SSH_KEY -o IdentitiesOnly=yes $PI_HOST"

echo "==> Syncing source to the Pi (excluding node_modules/dist/data/.git)"
$SSH "mkdir -p $REMOTE_DIR"
tar --exclude=node_modules --exclude=dist --exclude=data --exclude=.git --exclude='*.tsbuildinfo' \
  --force-local -czf - . \
  | $SSH "tar --force-local -xzf - -C $REMOTE_DIR"

echo "==> Installing dependencies and building on the Pi"
$SSH "cd $REMOTE_DIR && npm install && npm run build"

echo "==> Installing/refreshing the systemd unit"
$SSH "sudo cp $REMOTE_DIR/deploy/devdeploy-server.service /etc/systemd/system/devdeploy-server.service && sudo systemctl daemon-reload"

echo "==> Restarting devdeploy-server"
$SSH "sudo systemctl restart devdeploy-server && sudo systemctl status devdeploy-server --no-pager -l | head -20"

echo "==> Done. Dashboard: http://192.168.1.172:3000"
