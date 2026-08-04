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
  MIGRATION_JOB_NAME
  CANONICAL_INITIALIZATION_JOB_NAME
  AUTH_AUTHORITY
  AUTH_CLIENT_ID
  AUTH_API_SCOPE
  AUTH_API_ORIGIN
  AUTH_REDIRECT_URI
  AUTH_POST_LOGOUT_REDIRECT_URI
  AUTH_TRUSTED_ISSUER
  AUTH_API_AUDIENCE
  AUTH_REQUIRED_SCOPE
  AUTH_JWKS_URI
  AUTH_ACCEPTED_ALGORITHM
  APPLICATIONINSIGHTS_CONNECTION_STRING
  SERVER_DATABASE_URL

Optional environment variables:
  SERVER_CORS_ORIGIN
  OTEL_SAMPLING_RATIO
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
  MIGRATION_JOB_NAME=zzyix-staging-migrations
  CANONICAL_INITIALIZATION_JOB_NAME=zzyix-staging-canon-init
  AUTH_AUTHORITY=https://example.ciamlogin.com/example.onmicrosoft.com
  AUTH_CLIENT_ID=00000000-0000-0000-0000-000000000001
  AUTH_API_SCOPE=api://00000000-0000-0000-0000-000000000002/access_as_user
  AUTH_API_ORIGIN=https://app.example.com
  AUTH_REDIRECT_URI=https://app.example.com
  AUTH_POST_LOGOUT_REDIRECT_URI=https://app.example.com
  AUTH_TRUSTED_ISSUER=https://example.ciamlogin.com/00000000-0000-0000-0000-000000000003/v2.0
  AUTH_API_AUDIENCE=00000000-0000-0000-0000-000000000002
  AUTH_REQUIRED_SCOPE=access_as_user
  AUTH_JWKS_URI=https://example.ciamlogin.com/example.onmicrosoft.com/discovery/v2.0/keys
  AUTH_ACCEPTED_ALGORITHM=RS256
  APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=<key>;IngestionEndpoint=https://<region>.in.applicationinsights.azure.com/;ApplicationId=<app-id>
  SERVER_DATABASE_URL=postgres://...
  # Optional: override auto-resolved CORS origin
  # SERVER_CORS_ORIGIN=https://client.example.com
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

warn() {
  local message="$1"
  printf "WARNING: %s\n" "${message}" >&2
}

warn_if_non_explicit_sslmode() {
  local database_url="$1"
  local sslmode=""

  if [[ "${database_url}" =~ ([\?\&])sslmode=([^\&\#]+) ]]; then
    sslmode="${BASH_REMATCH[2]}"
  fi

  local normalized_sslmode
  normalized_sslmode="$(printf '%s' "${sslmode}" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "${normalized_sslmode}" ]]; then
    warn "SERVER_DATABASE_URL has no sslmode parameter. For production/staging, use sslmode=verify-full."
    return
  fi

  case "${normalized_sslmode}" in
    require|prefer|verify-ca)
      warn "SERVER_DATABASE_URL uses sslmode=${sslmode}. Use sslmode=verify-full to keep strong TLS verification and avoid pg v9 behavior changes."
      ;;
  esac
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
  require_value "MIGRATION_JOB_NAME"
  require_value "CANONICAL_INITIALIZATION_JOB_NAME"
  require_value "AUTH_AUTHORITY"
  require_value "AUTH_CLIENT_ID"
  require_value "AUTH_API_SCOPE"
  require_value "AUTH_API_ORIGIN"
  require_value "AUTH_REDIRECT_URI"
  require_value "AUTH_POST_LOGOUT_REDIRECT_URI"
  require_value "AUTH_TRUSTED_ISSUER"
  require_value "AUTH_API_AUDIENCE"
  require_value "AUTH_REQUIRED_SCOPE"
  require_value "AUTH_JWKS_URI"
  require_value "AUTH_ACCEPTED_ALGORITHM"
  require_value "APPLICATIONINSIGHTS_CONNECTION_STRING"
  require_value "SERVER_DATABASE_URL"
  warn_if_non_explicit_sslmode "${SERVER_DATABASE_URL}"

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
  set_environment_variable "${repo}" "${environment_name}" \
    "MIGRATION_JOB_NAME" "${MIGRATION_JOB_NAME}"
  set_environment_variable "${repo}" "${environment_name}" \
    "CANONICAL_INITIALIZATION_JOB_NAME" "${CANONICAL_INITIALIZATION_JOB_NAME}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_AUTHORITY" "${AUTH_AUTHORITY}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_CLIENT_ID" "${AUTH_CLIENT_ID}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_API_SCOPE" "${AUTH_API_SCOPE}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_API_ORIGIN" "${AUTH_API_ORIGIN}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_REDIRECT_URI" "${AUTH_REDIRECT_URI}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_POST_LOGOUT_REDIRECT_URI" "${AUTH_POST_LOGOUT_REDIRECT_URI}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_TRUSTED_ISSUER" "${AUTH_TRUSTED_ISSUER}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_API_AUDIENCE" "${AUTH_API_AUDIENCE}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_REQUIRED_SCOPE" "${AUTH_REQUIRED_SCOPE}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_JWKS_URI" "${AUTH_JWKS_URI}"
  set_environment_variable "${repo}" "${environment_name}" \
    "AUTH_ACCEPTED_ALGORITHM" "${AUTH_ACCEPTED_ALGORITHM}"
  set_environment_variable "${repo}" "${environment_name}" \
    "APPLICATIONINSIGHTS_CONNECTION_STRING" "${APPLICATIONINSIGHTS_CONNECTION_STRING}"
  if [[ -n "${OTEL_SAMPLING_RATIO:-}" ]]; then
    set_environment_variable "${repo}" "${environment_name}" \
      "OTEL_SAMPLING_RATIO" "${OTEL_SAMPLING_RATIO}"
  fi
  if [[ -n "${SERVER_CORS_ORIGIN:-}" ]]; then
    set_environment_variable "${repo}" "${environment_name}" \
      "SERVER_CORS_ORIGIN" "${SERVER_CORS_ORIGIN}"
  fi

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