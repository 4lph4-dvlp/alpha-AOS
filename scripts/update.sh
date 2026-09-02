#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
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

cd "$repo_root"
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to update a dirty checkout. Commit or stash local changes first." >&2
  exit 2
fi

git pull --ff-only
npm ci
npm run build
npm link

if [ "$apply" -eq 1 ]; then
  if [ -n "$target" ]; then
    node dist/src/cli.js update --apply --target "$target"
  else
    node dist/src/cli.js update --apply
  fi
else
  echo "Update downloaded and built. Showing the stable reconcile plan only."
  echo "Re-run with --apply to mutate harness configuration."
  if [ -n "$target" ]; then
    node dist/src/cli.js install --target "$target"
  else
    node dist/src/cli.js install
  fi
fi
