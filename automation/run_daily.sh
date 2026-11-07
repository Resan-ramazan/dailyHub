#!/bin/zsh
# Daily job-search run. Triggered at 08:30 by launchd (com.dailyhub.jobsearch.plist) or run manually.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/DailyHub"
DATE=$(date +%F)
OUT="$ROOT/Jobs/$DATE"
LOG_DIR="$ROOT/Jobs/logs"
mkdir -p "$OUT" "$LOG_DIR"
LOG="$LOG_DIR/$DATE.log"
cd "$ROOT" || exit 1
source "$ROOT/automation/lib.sh"
acquire_lock jobs
trap release_lock EXIT INT TERM

echo "=== $(date) start ===" >> "$LOG"
python3 automation/fetch_jobs.py "$OUT" >> "$LOG" 2>&1

PROMPT=$(sed -e "s|{{OUT_DIR}}|$OUT|g" -e "s|{{DATE}}|$DATE|g" automation/daily_prompt.md)

caffeinate -ims timeout 60m claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "WebSearch" "WebFetch" \
     "Bash(python3:*)" "Bash(mkdir:*)" "Bash(ls:*)" "Bash(cp:*)" \
  >> "$LOG" 2>&1
STATUS=$?
echo "=== $(date) end (exit $STATUS) ===" >> "$LOG"

# Upload results to GitHub so they can be read on the phone (failure here never blocks the local result).
git_upload Jobs/ "Daily jobs $DATE: Top 5 + tailored CVs" >> "$LOG" 2>&1

if [ $STATUS -eq 0 ] && [ -f "$OUT/00_Daily_Report.md" ]; then
  osascript -e "display notification \"Top 5 jobs + tailored CVs are ready in Jobs/$DATE\" with title \"Job Search\" sound name \"Glass\""
  open "$OUT"
else
  osascript -e "display notification \"Daily run failed. See Jobs/logs/$DATE.log\" with title \"Job Search\""
fi
