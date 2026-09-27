#!/bin/sh
# Updates the running instance to origin/main. Must run as root.
set -eu
cd "$(dirname "$0")/.."

# Braces make the shell parse the whole block before running it,
# so the git reset can safely overwrite this very file.
{
  backup=/etc/cron.daily/silvatab-backup
  if [ -x "$backup" ]; then
    "$backup"
  else
    echo "warning: $backup not found, skipping backup" >&2
  fi

  git fetch --quiet origin main
  git reset --hard origin/main
  docker compose up -d --build --wait
  docker image prune -f
  exit
}
