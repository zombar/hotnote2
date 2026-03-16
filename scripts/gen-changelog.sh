#!/usr/bin/env bash
# Usage: bash scripts/gen-changelog.sh [SINCE_DATE]
# Prepends a new monthly changelog section for commits since last documented date.
# Edit the output before committing.
set -euo pipefail

SINCE=${1:-"$(git log --no-merges --format='%ad' --date=short | tail -1)"}

git log --no-merges --format="%ad|%s" --date=short --since="$SINCE" \
  | awk -F'|' '
    BEGIN { cur=""; print "## [Unreleased] — " strftime("%Y-%m-%d") }
    {
      date=$1; msg=$2
      gsub(/^(feat|fix|chore|refactor|docs|style|test): ?/, "", msg)
      # Capitalise first letter
      msg = toupper(substr(msg,1,1)) substr(msg,2)
      print "- " msg
    }'
