#!/usr/bin/env bash
# Diagnostic: confirms the running agent process actually has the key this
# file thinks it should have, and that it's listening where expected.
set -uo pipefail
cd "$(dirname "$0")"
echo "pid on 8443:"
lsof -nP -iTCP:8443 -sTCP:LISTEN
echo "key file contents:"
cat -A .agent-api-key
echo "local request with that key:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" --oauth2-bearer "$(cat .agent-api-key)" http://127.0.0.1:8443/capabilities
echo "launchd job status:"
launchctl list | grep devdeploy || echo "not in launchctl list"
