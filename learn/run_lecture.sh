#!/bin/zsh
# Re-teach one pasted lecture transcript. Started from the dashboard (Learn → Lectures).
# Usage: learn/run_lecture.sh <lecture-id>
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/DailyHub"
ID="${1:?lecture id}"
[[ "$ID" =~ '^[a-z0-9][a-z0-9-]{0,80}$' ]] || exit 2
LOG_DIR="$ROOT/Lessons/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/lecture-$ID.log"
cd "$ROOT" || exit 1
source "$ROOT/automation/lib.sh"

echo "=== $(date) start ===" >> "$LOG"
caffeinate -ims timeout 30m python3 learn/generate.py lecture "$ID" >> "$LOG" 2>&1
STATUS=$?
echo "=== $(date) end (exit $STATUS) ===" >> "$LOG"

if [ $STATUS -eq 0 ]; then
  git_upload Lessons/ "Lecture note $ID" >> "$LOG" 2>&1
  osascript -e "display notification \"Your lecture note is ready\" with title \"Daily Hub\" sound name \"Glass\""
else
  osascript -e "display notification \"Lecture note failed. Open it in Learn to retry.\" with title \"Daily Hub\""
fi
exit $STATUS
