#!/bin/zsh
# Catch-up for missed morning runs. launchd runs this at login and every 15 minutes
# (com.dailyhub.catchup.plist). For each automation: if its scheduled time has passed,
# today has no successful run, fewer than 2 attempts were made and it is not running
# right now, start it. Covers a Mac that was shut down or asleep at the scheduled time.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="${CATCHUP_ROOT:-$HOME/DailyHub}"   # override only for tests
cd "$ROOT" || exit 1
TODAY=$(date +%F)
NOW="${CATCHUP_NOW:-$(date +%H%M)}"
CLOG="$ROOT/.locks/catchup.log"
mkdir -p "$ROOT/.locks"

# HHMM from a LaunchAgent plist (installed copy first, then the repo copy).
scheduled_time() {
  local label="$1" f h m
  for f in "$HOME/Library/LaunchAgents/$label.plist" "$ROOT/automation/$label.plist"; do
    [ -f "$f" ] || continue
    h=$(/usr/libexec/PlistBuddy -c "Print :StartCalendarInterval:Hour" "$f" 2>/dev/null) || continue
    m=$(/usr/libexec/PlistBuddy -c "Print :StartCalendarInterval:Minute" "$f" 2>/dev/null) || m=0
    printf "%02d%02d" "$h" "$m"; return 0
  done
  return 1
}

online() { curl -s -m 8 -o /dev/null https://github.com; }

check() {
  local name="$1" label="$2" script="$3" logdir="$4" at log attempts
  # Only automations whose LaunchAgent is installed are caught up.
  [ -f "$HOME/Library/LaunchAgents/$label.plist" ] || return 0
  at=$(scheduled_time "$label") || return 0
  [ "$NOW" -lt "$at" ] && return 0                        # not due yet
  [ "$NOW" -ge 2200 ] && return 0                         # too late in the day; tomorrow's run takes over
  log="$logdir/$TODAY.log"
  grep -q "end (exit 0)" "$log" 2>/dev/null && return 0  # already succeeded today
  attempts=$(grep -c " start ===" "$log" 2>/dev/null || true); attempts=${attempts:-0}
  [ "$attempts" -ge 2 ] && return 0                      # give up after 2 tries; the dashboard shows the failure
  [ -d "$ROOT/.locks/$name" ] && return 0                # running right now
  online || { echo "$(date) $name due but offline, will retry" >> "$CLOG"; return 0; }
  echo "$(date) $name missed its $at run (attempts today: $attempts), starting it" >> "$CLOG"
  [ -n "${DRY_RUN:-}" ] && { echo "DRY RUN: would start $name"; return 0; }
  /bin/zsh "$ROOT/$script"                               # sequential: never two runs at once
}

check news com.dailyhub.newsletter newsletter/run_daily.sh "$ROOT/News/logs"
check learn com.dailyhub.learn learn/run_daily.sh "$ROOT/Lessons/logs"
check jobs com.dailyhub.jobsearch automation/run_daily.sh "$ROOT/Jobs/logs"
