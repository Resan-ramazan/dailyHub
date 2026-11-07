#!/bin/zsh
# Daily Learn lessons (ChatGPT via Codex). Triggered at 07:00 by launchd (com.dailyhub.learn.plist), by catchup.sh, or manually.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/DailyHub"
DATE=$(date +%F)
LOG_DIR="$ROOT/Lessons/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$DATE.log"
cd "$ROOT" || exit 1
source "$ROOT/automation/lib.sh"
acquire_lock learn
trap release_lock EXIT INT TERM

echo "=== $(date) start ===" >> "$LOG"
caffeinate -ims timeout 30m python3 learn/generate.py daily "$@" >> "$LOG" 2>&1
STATUS=$?
echo "=== $(date) end (exit $STATUS) ===" >> "$LOG"

if [ $STATUS -eq 0 ]; then
  git_upload Lessons/ "Learn lessons $DATE" >> "$LOG" 2>&1
  osascript -e "display notification \"Today's lessons are ready\" with title \"Daily Hub\" sound name \"Glass\""
else
  osascript -e "display notification \"Learn lessons failed. See Lessons/logs/$DATE.log\" with title \"Daily Hub\""
fi
exit $STATUS
