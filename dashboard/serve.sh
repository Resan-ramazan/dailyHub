#!/bin/zsh
# Runs the Daily Hub on http://127.0.0.1:3333. Started at login by launchd
# (automation/com.dailyhub.dashboard.plist), which also restarts it if it stops.
# Rebuilds first when the code changed since the last build.
set -u
# fnm's "default" alias is a stable path to the current Node (the shell's fnm path changes per session).
export PATH="$HOME/.local/share/fnm/aliases/default/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")" || exit 1

if /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "$(date) port 3333 already in use; not starting a second server"
  sleep "${SERVE_BUSY_WAIT:-60}"   # keep launchd from restarting us in a tight loop
  exit 0
fi

[ -d node_modules ] || npm ci || exit 1
if [ ! -f .next/BUILD_ID ] || [ -n "$(find app components lib next.config.ts package.json -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  echo "$(date) code changed, building"
  npm run build || exit 1
fi
echo "$(date) starting server"
exec npm run start
