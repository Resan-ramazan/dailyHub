#!/bin/zsh
# Daily AI newsletter (ChatGPT via Codex). Triggered at 07:30 by launchd (com.dailyhub.newsletter.plist) or run manually.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/DailyHub"
DATE=$(date +%F)
LOG_DIR="$ROOT/News/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$DATE.log"
cd "$ROOT" || exit 1
source "$ROOT/automation/lib.sh"
acquire_lock news
trap release_lock EXIT INT TERM

# The API key lives in ~/DailyHub/.env (git-ignored); generate.py reads it itself.

echo "=== $(date) start ===" >> "$LOG"
caffeinate -ims timeout 30m python3 newsletter/generate.py >> "$LOG" 2>&1
STATUS=$?
echo "=== $(date) end (exit $STATUS) ===" >> "$LOG"

# Upload so the issue can be read on the phone (failure here never blocks the local result).
if [ $STATUS -eq 0 ]; then
  git_upload News/ "AI newsletter $DATE" >> "$LOG" 2>&1
  osascript -e "display notification \"Today's AI brief is ready\" with title \"Daily Hub\" sound name \"Glass\""
else
  osascript -e "display notification \"Newsletter failed. See News/logs/$DATE.log\" with title \"Daily Hub\""
fi
exit $STATUS
