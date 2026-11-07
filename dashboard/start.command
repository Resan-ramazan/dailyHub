#!/bin/zsh
# Double-click in Finder to open the Job Radar dashboard at http://127.0.0.1:3333
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || eval "$(fnm env 2>/dev/null)"
if curl -s -o /dev/null http://127.0.0.1:3333/; then open http://127.0.0.1:3333; exit 0; fi
[ -d node_modules ] || npm install
npm run build || exit 1
(sleep 2 && open http://127.0.0.1:3333) &
exec npm run start
