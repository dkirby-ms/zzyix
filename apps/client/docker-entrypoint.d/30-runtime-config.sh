#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# 30-runtime-config.sh
# Write runtime browser config from container environment variables.

set -euo pipefail

main() {
  local runtime_config_path="/usr/share/nginx/html/runtime-config.js"
  local server_url="${VITE_SERVER_URL:-}"
  local escaped_server_url

  escaped_server_url="$(printf '%s' "${server_url}" | sed 's/\\/\\\\/g; s/"/\\"/g')"

  cat >"${runtime_config_path}" <<EOF
window.__ZZYIX_RUNTIME_CONFIG__ = Object.freeze({
  VITE_SERVER_URL: "${escaped_server_url}",
});
EOF
}

main "$@"
