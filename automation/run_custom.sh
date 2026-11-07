#!/bin/zsh
# Tailors a CV + cover letter for one job the candidate found on their own. Started from the dashboard (Jobs → My jobs).
# Usage: automation/run_custom.sh <request-id>    (the request is Jobs/mine/<id>.json)
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/DailyHub"
ID="${1:?request id}"
[[ "$ID" =~ '^[a-z0-9][a-z0-9-]{0,80}$' ]] || exit 2
MINE="$ROOT/Jobs/mine"
REQ="$MINE/$ID.json"
[ -f "$REQ" ] || exit 2
LOG="$MINE/$ID.log"
cd "$ROOT" || exit 1
source "$ROOT/automation/lib.sh"

# set_status <status> [error]: updates the request file the dashboard reads.
set_status() {
  python3 - "$REQ" "$1" "${2:-}" "$MINE/$ID.result.json" <<'EOF'
import json, sys, os
req, status, err, res = sys.argv[1:]
d = json.load(open(req))
d["status"] = status
if os.path.exists(res):
    d.update(json.load(open(res)))
if err:
    d["error"] = err
if d.get("error"):
    d["status"] = "failed"
json.dump(d, open(req + ".tmp", "w"), ensure_ascii=False, indent=1)
os.replace(req + ".tmp", req)
EOF
}

field() { python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2]) or '')" "$REQ" "$1"; }

DATE=$(date +%F)
URL=$(field url)
NOTE=$(field note | tr '\n' ' ')
TEXT_FILE="Jobs/mine/$ID.txt"
[ -f "$ROOT/$TEXT_FILE" ] || TEXT_FILE="(none)"
rm -f "$MINE/$ID.result.json"
mkdir -p "$ROOT/Jobs/$DATE"
set_status running

# Escape for sed replacement: backslash, the | delimiter and &.
esc() { printf '%s' "$1" | sed -e 's/[\\|&]/\\&/g'; }
PROMPT=$(sed -e "s|{{ID}}|$ID|g" -e "s|{{DATE}}|$DATE|g" -e "s|{{URL}}|$(esc "$URL")|g" \
             -e "s|{{TEXT_FILE}}|$TEXT_FILE|g" -e "s|{{NOTE}}|$(esc "$NOTE")|g" automation/custom_prompt.md)

echo "=== $(date) start ===" >> "$LOG"
caffeinate -ims timeout 40m claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "WebSearch" "WebFetch" \
     "Bash(python3:*)" "Bash(mkdir:*)" "Bash(ls:*)" "Bash(cp:*)" \
  >> "$LOG" 2>&1
STATUS=$?
echo "=== $(date) end (exit $STATUS) ===" >> "$LOG"

if [ $STATUS -eq 0 ] && [ -f "$MINE/$ID.result.json" ]; then
  set_status ready
  [ "$(field status)" = "ready" ] && {
    git_upload Jobs/ "My job: $(field company) $(field title)" >> "$LOG" 2>&1
    osascript -e "display notification \"CV + cover letter for $(field company) are ready\" with title \"Job Search\" sound name \"Glass\""
    exit 0
  }
else
  set_status failed "The run stopped before finishing (exit $STATUS). See the log."
fi
osascript -e "display notification \"Could not prepare that job. Open My jobs to retry.\" with title \"Job Search\""
exit 1
