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

app_path="apps/${app}"

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
  if [[ -n "$(git rev-list -1 HEAD -- "$app_path" || true)" ]]; then
    echo "release=true"
    exit 0
  fi

  echo "release=false"
  exit 0
fi

if [[ -n "$(git rev-list -1 "$last_tag..HEAD" -- "$app_path" || true)" ]]; then
  echo "release=true"
  exit 0
fi

echo "release=false"
