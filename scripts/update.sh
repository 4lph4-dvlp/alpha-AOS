#!/usr/bin/env sh
# A launcher, not an updater.
#
# The dirty-checkout check, the remote resolution, the fast-forward, the
# package install, the build, the link and the managed reconcile all belong to
# the core service, which performs them under one reviewed plan and one writer
# session. This script verifies the artifact and delegates.
set -eu

apply=0
target=""

while [ "$#" -gt 0 ]; do
  case "$1" in
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

cd "$repo_root"

if ! node scripts/build-artifact.mjs check; then
  echo "alpha-aos: refusing to run without a verified build artifact." >&2
  exit 3
fi

set -- bootstrap update
[ -n "$target" ] && set -- "$@" --target "$target"
if [ "$apply" -eq 1 ]; then
  set -- "$@" --apply
else
  echo "Showing the update plan only."
  echo "Re-run with --apply to run it under one reviewed operation session."
fi

exec node dist/src/cli.js "$@"
