#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# Rehearse additive quilt migration, rollback, and recovery operations.

set -euo pipefail

readonly DEFAULT_ADMIN_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
readonly DATABASE_PREFIX='zzyix_quilt_rehearsal'
readonly CANVAS_ID='10000000-0000-4000-8000-000000000071'
readonly TILE_A_ID='20000000-0000-4000-8000-000000000071'
readonly TILE_B_ID='20000000-0000-4000-8000-000000000072'

usage() {
  cat <<'EOF'
Usage: verify-quilt-migration.sh [rehearse|migrate|backfill|parity|rollback|recover]

Environment:
  DATABASE_URL              Target database for individual operations
  TEST_DATABASE_ADMIN_URL   Loopback admin URL for disposable rehearsal

Non-loopback operations require all of these explicit controls:
  QUILT_MIGRATION_PRODUCTION_APPROVED=true
  QUILT_MIGRATION_CHANGE_ID=<reviewed change identifier>
  QUILT_MIGRATION_CONFIRM_DATABASE=<exact database name>
EOF
}

err() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" &>/dev/null || err "'$1' command is required"
}

database_host() {
  node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$1"
}

database_name() {
  node -e 'process.stdout.write(new URL(process.argv[1]).pathname.slice(1))' "$1"
}

assert_safe_database() {
  local database_url="$1"
  local host
  local name
  host="$(database_host "${database_url}")"
  name="$(database_name "${database_url}")"

  if [[ "${host}" == '127.0.0.1' || "${host}" == 'localhost' || "${host}" == '::1' ]]; then
    return
  fi

  [[ "${QUILT_MIGRATION_PRODUCTION_APPROVED:-}" == 'true' ]] || \
    err 'Non-loopback database refused without production approval'
  [[ -n "${QUILT_MIGRATION_CHANGE_ID:-}" ]] || \
    err 'Non-loopback database refused without QUILT_MIGRATION_CHANGE_ID'
  [[ "${QUILT_MIGRATION_CONFIRM_DATABASE:-}" == "${name}" ]] || \
    err 'Non-loopback database confirmation does not match the target database'
}

run_server_command() {
  local database_url="$1"
  local command="$2"
  DATABASE_URL="${database_url}" npm run "${command}" --workspace=apps/server
}

apply_migrations() {
  run_server_command "$1" 'db:apply'
}

backfill() {
  run_server_command "$1" 'db:backfill:quilts'
}

parity() {
  run_server_command "$1" 'db:parity:quilts'
}

verify_retention_reconstruction() {
  local admin_url="$1"
  TEST_DATABASE_ADMIN_URL="${admin_url}" \
    npm exec --workspace=apps/server -- \
      vitest run src/db/recovery.postgres.integration.test.ts --reporter=dot
}

rollback() {
  local database_url="$1"
  psql "${database_url}" --no-psqlrc --set ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE tiles SET quilt_id = NULL, anchor_patch_id = NULL;
DELETE FROM quilts WHERE legacy_canvas_id IS NOT NULL;
COMMIT;
SQL
}

seed_representative_data() {
  local database_url="$1"
  psql "${database_url}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --set canvas_id="${CANVAS_ID}" --set tile_a_id="${TILE_A_ID}" \
    --set tile_b_id="${TILE_B_ID}" <<'SQL'
INSERT INTO canvases (id, version, canvas_config)
VALUES (
  :'canvas_id',
  2,
  '{"canvasSize":{"width":20.8,"height":13.6},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-10.4,"maxX":10.4,"minY":-6.8,"maxY":6.8}}}'::jsonb
);
INSERT INTO tiles (
  id, canvas_id, shape, color, material, pos_x, pos_y, rotation, mirrored,
  placed_by, chunk_x, chunk_y, created_at
)
VALUES
  (:'tile_a_id', :'canvas_id', 'square', '#abc', 'ceramic', -7.25, 2.5,
   0.25, true, 'legacy-author-a', -1, 0, '2026-01-01T00:00:00Z'),
  (:'tile_b_id', :'canvas_id', 'triangle', '#def', 'glass', 8.75, -3.5,
   1.5, false, 'legacy-author-b', 1, -1, '2026-01-02T00:00:00Z');
INSERT INTO operation_log (canvas_id, op_seq, op_type, payload, client_id)
VALUES
  (:'canvas_id', 1, 'tile_placed', jsonb_build_object('tileId', :'tile_a_id'), 'legacy-author-a'),
  (:'canvas_id', 2, 'tile_placed', jsonb_build_object('tileId', :'tile_b_id'), 'legacy-author-b');
INSERT INTO snapshots (canvas_id, op_seq, state)
VALUES (:'canvas_id', 2, jsonb_build_array(
  jsonb_build_object('id', :'tile_a_id'),
  jsonb_build_object('id', :'tile_b_id')
));
SQL
}

legacy_fingerprint() {
  psql "$1" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command="SELECT count(*) || ':' || count(DISTINCT placed_by) || ':' || md5(string_agg(id::text || ':' || pos_x || ':' || pos_y || ':' || rotation || ':' || mirrored || ':' || coalesce(placed_by, ''), ',' ORDER BY id)) FROM tiles;"
}

rehearse() {
  local admin_url="${TEST_DATABASE_ADMIN_URL:-${DEFAULT_ADMIN_URL}}"
  local database="${DATABASE_PREFIX}_$(date +%s)_${RANDOM}"
  local database_url
  local before
  local after
  assert_safe_database "${admin_url}"
  database_url="$(node -e 'const url = new URL(process.argv[1]); url.pathname = `/${process.argv[2]}`; process.stdout.write(url.toString())' "${admin_url}" "${database}")"

  cleanup() {
    psql "${admin_url}" --no-psqlrc --set ON_ERROR_STOP=1 \
      --command="DROP DATABASE IF EXISTS \"${database}\" WITH (FORCE)" >/dev/null
  }
  trap cleanup EXIT

  psql "${admin_url}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --command="CREATE DATABASE \"${database}\"" >/dev/null
  apply_migrations "${database_url}"
  seed_representative_data "${database_url}"
  before="$(legacy_fingerprint "${database_url}")"
  backfill "${database_url}"
  backfill "${database_url}"
  parity "${database_url}"
  rollback "${database_url}"
  after="$(legacy_fingerprint "${database_url}")"
  [[ "${before}" == "${after}" ]] || err 'Rollback changed legacy identity, layout, or authorship'
  backfill "${database_url}"
  parity "${database_url}"
  verify_retention_reconstruction "${admin_url}"
  cleanup
  trap - EXIT
  printf 'Quilt migration rehearsal completed; disposable database removed.\n'
}

main() {
  local operation="${1:-rehearse}"
  require_command node
  require_command npm
  require_command psql

  if [[ "${operation}" == 'rehearse' ]]; then
    rehearse
    return
  fi

  [[ -n "${DATABASE_URL:-}" ]] || err 'DATABASE_URL is required for this operation'
  assert_safe_database "${DATABASE_URL}"
  case "${operation}" in
    migrate) apply_migrations "${DATABASE_URL}" ;;
    backfill) backfill "${DATABASE_URL}" ;;
    parity) parity "${DATABASE_URL}" ;;
    rollback) rollback "${DATABASE_URL}" ;;
    recover) backfill "${DATABASE_URL}"; parity "${DATABASE_URL}" ;;
    help|-h|--help) usage ;;
    *) usage; err "Unknown operation: ${operation}" ;;
  esac
}

main "$@"