#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# bootstrap-cd-environment.sh
# Create/update GitHub Environment variables and secrets for CD deployment.

set -euo pipefail

readonly DEFAULT_ENVIRONMENT_NAME="staging"
readonly DEFAULT_ENV_FILE="scripts/gh-vars.env"

usage() {
  cat <<'USAGE'
Usage: bootstrap-cd-environment.sh [OPTIONS]

Create or update GitHub Environment variables and secrets used by CD.

Options:
  --repo <owner/repo>         Target repository (default: current gh repo)
  --environment <name>        GitHub Environment name (default: staging)
  --env-file <path>           File with KEY=VALUE pairs (default: scripts/gh-vars.env)
  --help, -h                  Show this help message

Required environment variables:
  AZURE_CLIENT_ID
  AZURE_TENANT_ID
  AZURE_SUBSCRIPTION_ID
  AZURE_RESOURCE_GROUP
  AZURE_CONTAINERAPPS_ENVIRONMENT
  AZURE_LOCATION
  SERVER_CONTAINER_APP_NAME
  CLIENT_CONTAINER_APP_NAME
  SERVER_CORS_ORIGIN
  SERVER_DATABASE_URL

Optional environment variables:
  AZURE_GHCR_USERNAME
  AZURE_GHCR_PASSWORD

Examples:
  cat > scripts/gh-vars.env <<'EOF'
  AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
  AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
  AZURE_SUBSCRIPTION_ID=00000000-0000-0000-0000-000000000000
  AZURE_RESOURCE_GROUP=rg-zzyix-staging
  AZURE_CONTAINERAPPS_ENVIRONMENT=zzyix-staging-aca-env
  AZURE_LOCATION=eastus
  SERVER_CONTAINER_APP_NAME=zzyix-staging-server
  CLIENT_CONTAINER_APP_NAME=zzyix-staging-client
  SERVER_CORS_ORIGIN=https://client.example.com
  SERVER_DATABASE_URL=postgres://...
  EOF
  ./scripts/bootstrap-cd-environment.sh --repo dkirby-ms/zzyix
USAGE
}

err() {
  local message="$1"
  printf "ERROR: %s\n" "${message}" >&2
  exit 1
}

log() {
  local message="$1"
  printf "%s\n" "${message}"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    err "'${command_name}' is required but not installed"
  fi
}

require_value() {
  local var_name="$1"
  local value="${!var_name:-}"
  if [[ -z "${value}" ]]; then
    err "Required environment variable '${var_name}' is missing"
  fi
}

set_environment_variable() {
  local repo="$1"
  local environment_name="$2"
  local name="$3"
  local value="$4"

  gh variable set "${name}" \
    --repo "${repo}" \
    --env "${environment_name}" \
    --body "${value}" >/dev/null

  log "Set environment variable: ${name}"
}

set_environment_secret() {
  local repo="$1"
  local environment_name="$2"
  local name="$3"
  local value="$4"

  gh secret set "${name}" \
    --repo "${repo}" \
    --env "${environment_name}" \
    --body "${value}" >/dev/null

  log "Set environment secret: ${name}"
}

create_environment_if_missing() {
  local repo="$1"
  local environment_name="$2"

  gh api \
    --method PUT \
    "repos/${repo}/environments/${environment_name}" >/dev/null

  log "Ensured GitHub Environment exists: ${environment_name}"
}

resolve_default_repo() {
  gh repo view --json nameWithOwner --jq .nameWithOwner
}

load_env_file() {
  local env_file="$1"

  if [[ ! -f "${env_file}" ]]; then
    err "Env file not found: ${env_file}"
  fi

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line
    line="$(printf '%s' "${raw_line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    if [[ -z "${line}" || "${line}" == \#* ]]; then
      continue
    fi

    if [[ "${line}" != *"="* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    key="$(printf '%s' "${key}" | sed -e 's/[[:space:]]*$//')"

    if [[ ! "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      err "Invalid variable name in env file: ${key}"
    fi

    if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "${key}=${value}"
  done <"${env_file}"
}

main() {
  require_command "gh"

  local repo=""
  local environment_name="${DEFAULT_ENVIRONMENT_NAME}"
  local env_file="${DEFAULT_ENV_FILE}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ -n "${2:-}" && "${2}" != --* ]] || err "--repo requires a value"
        repo="$2"
        shift 2
        ;;
      --environment)
        [[ -n "${2:-}" && "${2}" != --* ]] || err "--environment requires a value"
        environment_name="$2"
        shift 2
        ;;
      --env-file)
        [[ -n "${2:-}" && "${2}" != --* ]] || err "--env-file requires a value"
        env_file="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        err "Unknown argument: $1"
        ;;
    esac
  done

  if [[ -z "${repo}" ]]; then
    repo="$(resolve_default_repo)"
  fi

  load_env_file "${env_file}"

  require_value "AZURE_CLIENT_ID"
  require_value "AZURE_TENANT_ID"
  require_value "AZURE_SUBSCRIPTION_ID"
  require_value "AZURE_RESOURCE_GROUP"
  require_value "AZURE_CONTAINERAPPS_ENVIRONMENT"
  require_value "AZURE_LOCATION"
  require_value "SERVER_CONTAINER_APP_NAME"
  require_value "CLIENT_CONTAINER_APP_NAME"
  require_value "SERVER_CORS_ORIGIN"
  require_value "SERVER_DATABASE_URL"

  create_environment_if_missing "${repo}" "${environment_name}"

  set_environment_variable "${repo}" "${environment_name}" "AZURE_CLIENT_ID" \
    "${AZURE_CLIENT_ID}"
  set_environment_variable "${repo}" "${environment_name}" "AZURE_TENANT_ID" \
    "${AZURE_TENANT_ID}"
  set_environment_variable "${repo}" "${environment_name}" "AZURE_SUBSCRIPTION_ID" \
    "${AZURE_SUBSCRIPTION_ID}"
  set_environment_variable "${repo}" "${environment_name}" "AZURE_RESOURCE_GROUP" \
    "${AZURE_RESOURCE_GROUP}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AZURE_CONTAINERAPPS_ENVIRONMENT" "${AZURE_CONTAINERAPPS_ENVIRONMENT}"
  set_environment_variable "${repo}" "${environment_name}" "AZURE_LOCATION" \
    "${AZURE_LOCATION}"
  set_environment_variable "${repo}" "${environment_name}" \
    "SERVER_CONTAINER_APP_NAME" "${SERVER_CONTAINER_APP_NAME}"
  set_environment_variable "${repo}" "${environment_name}" \
    "CLIENT_CONTAINER_APP_NAME" "${CLIENT_CONTAINER_APP_NAME}"
  set_environment_variable "${repo}" "${environment_name}" "SERVER_CORS_ORIGIN" \
    "${SERVER_CORS_ORIGIN}"

  set_environment_secret "${repo}" "${environment_name}" "SERVER_DATABASE_URL" \
    "${SERVER_DATABASE_URL}"

  if [[ -n "${AZURE_GHCR_USERNAME:-}" ]]; then
    set_environment_secret "${repo}" "${environment_name}" \
      "AZURE_GHCR_USERNAME" "${AZURE_GHCR_USERNAME}"
  fi

  if [[ -n "${AZURE_GHCR_PASSWORD:-}" ]]; then
    set_environment_secret "${repo}" "${environment_name}" \
      "AZURE_GHCR_PASSWORD" "${AZURE_GHCR_PASSWORD}"
  fi

  log "Done. Environment '${environment_name}' is configured for '${repo}'."
}

main "$@"