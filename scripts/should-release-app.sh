#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <client|server>" >&2
  exit 2
fi

app="$1"

if [[ "$app" != "client" && "$app" != "server" ]]; then
  echo "Invalid app '$app'. Expected 'client' or 'server'." >&2
  exit 2
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "release=false"
  exit 0
fi

last_tag=""
if [[ "$app" == "client" ]]; then
  last_tag="$(git tag --list 'client-v*' --sort=-v:refname | head -n 1 || true)"
else
  last_tag="$(git tag --list 'server-v*' --sort=-v:refname | head -n 1 || true)"
fi

if [[ -z "$last_tag" ]]; then
  if [[ "$app" == "client" ]]; then
    if git log --pretty=format: --name-only -- apps/client | grep -qE '^apps/client/'; then
      echo "release=true"
      exit 0
    fi
  else
    if git log --pretty=format: --name-only -- apps/server | grep -qE '^apps/server/'; then
      echo "release=true"
      exit 0
    fi
  fi

  echo "release=false"
  exit 0
fi

range="$last_tag..HEAD"
changed_files="$(git diff --name-only "$range" || true)"
if [[ -z "$changed_files" ]]; then
  echo "release=false"
  exit 0
fi

if [[ "$app" == "client" ]]; then
  if echo "$changed_files" | grep -Eq '^apps/client/'; then
    echo "release=true"
    exit 0
  fi
else
  if echo "$changed_files" | grep -Eq '^apps/server/'; then
    echo "release=true"
    exit 0
  fi
fi

echo "release=false"
