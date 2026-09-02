#!/usr/bin/env sh
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
  exit 2
fi

node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 24 ]; then
  echo "Node.js 24 or newer is required; found $(node --version)." >&2
  exit 2
fi

cd "$repo_root"
npm ci
npm run build

if [ "$skip_link" -eq 0 ]; then
  npm link
  echo "Installed alpha-aos as a user-wide npm command."
fi

node dist/src/cli.js doctor

if [ "$apply" -eq 1 ]; then
  if [ -n "$target" ]; then
    node dist/src/cli.js install --target "$target" --apply
  else
    node dist/src/cli.js install --apply
  fi
else
  echo "Showing the detected-harness install plan only."
  echo "Re-run with --apply to mutate user-wide harness configuration."
  if [ -n "$target" ]; then
    node dist/src/cli.js install --target "$target"
  else
    node dist/src/cli.js install
  fi
fi
