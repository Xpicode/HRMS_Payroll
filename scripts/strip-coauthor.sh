#!/usr/bin/env bash
# One-off: remove the "Co-Authored-By: Claude …" trailer from every commit message and
# force-push, so GitHub stops listing "claude" as a contributor. Rewrites history: run it
# only when this PC holds the sole clone (true on 16 Sep 2026). A backup tag is kept.
#
#   bash scripts/strip-coauthor.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; commit or stash first." >&2
  exit 1
fi

before=$(git log --format=%B | grep -c '^Co-Authored-By: Claude' || true)
echo "Commits with the trailer: $before"
git tag -f backup-before-coauthor-strip >/dev/null
echo "Backup tag: backup-before-coauthor-strip (git reset --hard backup-before-coauthor-strip to undo)"

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --msg-filter 'sed -e "/^Co-Authored-By: Claude/d" | sed -e :a -e "/^\n*$/{\$d;N;ba" -e "}"' \
  -- --all >/dev/null

after=$(git log --format=%B | grep -c '^Co-Authored-By: Claude' || true)
echo "Commits with the trailer after rewrite: $after"
[ "$after" = "0" ] || { echo "Rewrite incomplete; nothing pushed." >&2; exit 1; }

git push --force origin main
rm -rf .git/refs/original
echo "Done. GitHub's contributor list refreshes within a few minutes."
