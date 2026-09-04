#!/usr/bin/env sh
# A launcher, not an installer.
#
# This script verifies that a build artifact with proven provenance exists and
# then hands the whole operation to the core service, which owns the reviewed
# plan and the single writer session. It runs no git, npm, build or link step
# of its own, and it has no fallback path that would.
set -eu

skip_link=0
apply=0
target=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-link) skip_link=1 ;;
    --apply) apply=1 ;;
    --target)
      shift
      [ "$#" -gt 0 ] || { echo "--target requires a value" >&2; exit 2; }
      target=$1
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 or newer is required." >&2
  exit 3
fi

node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 24 ]; then
  echo "Node.js 24 or newer is required; found $(node --version)." >&2
  exit 3
fi

cd "$repo_root"

# The only prerequisite. A missing or stale artifact refuses here; this script
# never rebuilds one, because building is a mutation and mutations belong to
# the reviewed operation.
if ! node scripts/build-artifact.mjs check; then
  echo "alpha-aos: refusing to run without a verified build artifact." >&2
  exit 3
fi

set -- bootstrap install
[ "$skip_link" -eq 1 ] && set -- "$@" --skip-link
[ -n "$target" ] && set -- "$@" --target "$target"
if [ "$apply" -eq 1 ]; then
  set -- "$@" --apply
else
  echo "Showing the install plan only."
  echo "Re-run with --apply to run it under one reviewed operation session."
fi

exec node dist/src/cli.js "$@"
