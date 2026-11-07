# Shared helpers for the Daily Hub automations. Source it: `source "$ROOT/automation/lib.sh"`.

# acquire_lock <name>: makes sure only one copy of a job runs at a time.
# Exits quietly if another copy is running. A lock older than 3 hours is treated
# as left over from a crash and removed.
acquire_lock() {
  LOCK_DIR="$ROOT/.locks/$1"
  mkdir -p "$ROOT/.locks"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
      rm -rf "$LOCK_DIR" && mkdir "$LOCK_DIR" || exit 0
    else
      echo "$(date) $1 already running, skipped" >> "$ROOT/.locks/skipped.log"
      exit 0
    fi
  fi
}
# Note (zsh): an EXIT trap set inside a function fires when the function returns,
# so callers release the lock themselves:  acquire_lock X; trap release_lock EXIT INT TERM
release_lock() { [ -n "${LOCK_DIR:-}" ] && rm -rf "$LOCK_DIR"; }

# git_upload <folder> <message>: commit only <folder> and push. Waits for any other
# automation's git step to finish first, so two jobs never touch git at the same time.
git_upload() {
  local folder="$1" msg="$2" glock="$ROOT/.locks/git" i=0
  until mkdir "$glock" 2>/dev/null; do
    i=$((i + 1)); [ $i -gt 120 ] && { echo "git busy for 10 min, upload skipped"; return 1; }
    sleep 5
  done
  {
    git pull -q --rebase --autostash origin main
    git add "$folder" && git commit -q -m "$msg" -- "$folder" && GIT_TERMINAL_PROMPT=0 git push -q origin main
    echo "git upload exit $?"
  }
  rm -rf "$glock"
}
