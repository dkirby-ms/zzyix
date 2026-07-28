#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# Rehearse additive quilt migration, rollback, and recovery operations.

set -euo pipefail

readonly DEFAULT_ADMIN_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
readonly DATABASE_PREFIX='zzyix_quilt_rehearsal'
REHEARSAL_ADMIN_URL=''
REHEARSAL_FRESH_DATABASE=''
REHEARSAL_UPGRADE_DATABASE=''

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

apply_migration_prefix() {
  local database_url="$1"
  local last_migration="$2"
  local last_index="${last_migration%%_*}"
  local migrations_folder
  migrations_folder="$(mktemp -d)"
  mkdir -p "${migrations_folder}/meta"

  find apps/server/migrations -maxdepth 1 -type f -name '*.sql' -print0 |
    sort -z |
    while IFS= read -r -d '' migration; do
      if [[ "$(basename "${migration}")" > "${last_migration}" ]]; then
        break
      fi
      cp "${migration}" "${migrations_folder}/"
    done

  jq ".entries |= map(select(.idx <= ${last_index#0}))" \
    apps/server/migrations/meta/_journal.json > \
    "${migrations_folder}/meta/_journal.json"

  DATABASE_URL="${database_url}" MIGRATIONS_FOLDER="${migrations_folder}" \
    node --input-type=module --eval \
      "import { applyDatabaseMigrations } from './apps/server/dist/db/migrate.js';
       import { closeDatabaseBundle } from './apps/server/dist/db/client.js';
       await applyDatabaseMigrations(process.env.MIGRATIONS_FOLDER);
       await closeDatabaseBundle();"
  rm -rf "${migrations_folder}"
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
  psql "${database_url}" --no-psqlrc --set ON_ERROR_STOP=1 <<'SQL'
INSERT INTO canvases (id, version, canvas_config, created_at, updated_at)
VALUES
  ('10000000-0000-4000-8000-000000000071', 1,
   '{"canvasSize":{"width":10.4,"height":6.8},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-5.2,"maxX":5.2,"minY":-3.4,"maxY":3.4}}}'::jsonb,
   '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'),
  ('10000000-0000-4000-8000-000000000072', 2,
   '{"canvasSize":{"width":20.8,"height":13.6},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-10.4,"maxX":10.4,"minY":-6.8,"maxY":6.8}}}'::jsonb,
   '2026-02-01T00:00:00Z', '2026-02-01T01:00:00Z'),
  ('10000000-0000-4000-8000-000000000073', 3,
   '{"canvasSize":{"width":31.2,"height":20.4},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-15.6,"maxX":15.6,"minY":-10.2,"maxY":10.2}}}'::jsonb,
   '2026-03-01T00:00:00Z', '2026-03-01T01:00:00Z');
INSERT INTO tiles (
  id, canvas_id, shape, color, material, pos_x, pos_y, rotation, mirrored,
  placed_by, chunk_x, chunk_y, created_at
)
VALUES
  ('20000000-0000-4000-8000-000000000071',
   '10000000-0000-4000-8000-000000000071', 'square', '#abc', 'ceramic',
   -5.19, -3.39, 0, false, 'classic-author', -1, -1,
   '2026-01-02T03:04:05.123Z'),
  ('20000000-0000-4000-8000-000000000072',
   '10000000-0000-4000-8000-000000000072', 'triangle', '#def', 'glass',
   7.9, 0, 1.5, true, 'expanded-author', 0, 0,
   '2026-02-02T03:04:05.456Z'),
  ('20000000-0000-4000-8000-000000000073',
   '10000000-0000-4000-8000-000000000073', 'rectangle', '#123456', 'stone',
   15.59, 10.19, 3.14159, false, NULL, 1, 1,
   '2026-03-02T03:04:05.789Z'),
  ('20000000-0000-4000-8000-000000000074',
   '10000000-0000-4000-8000-000000000073', 'l-shape', '#654321', 'ceramic',
   -8.01, -8.01, 0.75, true, 'vast-author', -2, -2,
   '2026-03-03T03:04:05.999Z');
INSERT INTO operation_log (canvas_id, op_seq, op_type, payload, client_id)
VALUES
  ('10000000-0000-4000-8000-000000000071', 1, 'tile_placed',
   '{"tileId":"20000000-0000-4000-8000-000000000071"}', 'classic-author'),
  ('10000000-0000-4000-8000-000000000072', 1, 'tile_placed',
   '{"tileId":"20000000-0000-4000-8000-000000000072"}', 'expanded-author'),
  ('10000000-0000-4000-8000-000000000073', 1, 'tile_placed',
   '{"tileId":"20000000-0000-4000-8000-000000000073"}', 'vast-author'),
  ('10000000-0000-4000-8000-000000000073', 2, 'tile_placed',
   '{"tileId":"20000000-0000-4000-8000-000000000074"}', 'vast-author');
INSERT INTO snapshots (canvas_id, op_seq, state)
VALUES
  ('10000000-0000-4000-8000-000000000071', 1,
   '[{"id":"20000000-0000-4000-8000-000000000071"}]'),
  ('10000000-0000-4000-8000-000000000072', 1,
   '[{"id":"20000000-0000-4000-8000-000000000072"}]'),
  ('10000000-0000-4000-8000-000000000073', 2,
   '[{"id":"20000000-0000-4000-8000-000000000073"},{"id":"20000000-0000-4000-8000-000000000074"}]');
SQL
}

legacy_fingerprint() {
  psql "$1" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command="SELECT md5((SELECT string_agg(concat_ws('|', id, version, canvas_config::text, extract(epoch FROM created_at), extract(epoch FROM updated_at)), ',' ORDER BY id) FROM canvases) || ':' || (SELECT string_agg(concat_ws('|', id, canvas_id, shape, color, material, pos_x, pos_y, chunk_x, chunk_y, rotation, mirrored, coalesce(placed_by, ''), extract(epoch FROM created_at)), ',' ORDER BY id) FROM tiles));"
}

schema_fingerprint() {
  psql "$1" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 <<'SQL'
WITH schema_objects AS (
  SELECT 'column' AS kind,
         table_name || '|' || ordinal_position || '|' || column_name || '|' ||
         data_type || '|' || is_nullable || '|' || coalesce(column_default, '') AS definition
  FROM information_schema.columns
  WHERE table_schema = 'public'
  UNION ALL
  SELECT 'constraint', conrelid::regclass::text || '|' || conname || '|' || pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'index', tablename || '|' || indexname || '|' || indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  UNION ALL
  SELECT 'function', proname || '|' || pg_get_functiondef(oid)
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'trigger', event_object_table || '|' || trigger_name || '|' ||
         event_manipulation || '|' || action_statement
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
)
SELECT md5(string_agg(kind || ':' || definition, E'\n' ORDER BY kind, definition))
FROM schema_objects;
SQL
}

cleanup_rehearsal_databases() {
  if [[ -z "${REHEARSAL_ADMIN_URL}" ]]; then
    return
  fi

  psql "${REHEARSAL_ADMIN_URL}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --command="DROP DATABASE IF EXISTS \"${REHEARSAL_FRESH_DATABASE}\" WITH (FORCE)" >/dev/null
  psql "${REHEARSAL_ADMIN_URL}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --command="DROP DATABASE IF EXISTS \"${REHEARSAL_UPGRADE_DATABASE}\" WITH (FORCE)" >/dev/null
}

rehearse() {
  local admin_url="${TEST_DATABASE_ADMIN_URL:-${DEFAULT_ADMIN_URL}}"
  local run_id="$(date +%s)_${RANDOM}"
  local fresh_database="${DATABASE_PREFIX}_fresh_${run_id}"
  local upgrade_database="${DATABASE_PREFIX}_upgrade_${run_id}"
  local fresh_database_url
  local upgrade_database_url
  local fresh_schema
  local upgrade_schema
  local before
  local after
  assert_safe_database "${admin_url}"
  fresh_database_url="$(node -e 'const url = new URL(process.argv[1]); url.pathname = `/${process.argv[2]}`; process.stdout.write(url.toString())' "${admin_url}" "${fresh_database}")"
  upgrade_database_url="$(node -e 'const url = new URL(process.argv[1]); url.pathname = `/${process.argv[2]}`; process.stdout.write(url.toString())' "${admin_url}" "${upgrade_database}")"
  REHEARSAL_ADMIN_URL="${admin_url}"
  REHEARSAL_FRESH_DATABASE="${fresh_database}"
  REHEARSAL_UPGRADE_DATABASE="${upgrade_database}"
  trap cleanup_rehearsal_databases EXIT

  psql "${admin_url}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --command="CREATE DATABASE \"${fresh_database}\"" >/dev/null
  psql "${admin_url}" --no-psqlrc --set ON_ERROR_STOP=1 \
    --command="CREATE DATABASE \"${upgrade_database}\"" >/dev/null

  apply_migrations "${fresh_database_url}"
  apply_migration_prefix "${upgrade_database_url}" '0004_store_canvas_config.sql'
  seed_representative_data "${upgrade_database_url}"
  before="$(legacy_fingerprint "${upgrade_database_url}")"
  apply_migrations "${upgrade_database_url}"

  fresh_schema="$(schema_fingerprint "${fresh_database_url}")"
  upgrade_schema="$(schema_fingerprint "${upgrade_database_url}")"
  [[ "${fresh_schema}" == "${upgrade_schema}" ]] || \
    err 'Fresh and upgraded databases produced different schemas'

  backfill "${upgrade_database_url}"
  backfill "${upgrade_database_url}"
  parity "${upgrade_database_url}"
  rollback "${upgrade_database_url}"
  after="$(legacy_fingerprint "${upgrade_database_url}")"
  [[ "${before}" == "${after}" ]] || err 'Rollback changed legacy identity, layout, or authorship'
  backfill "${upgrade_database_url}"
  parity "${upgrade_database_url}"
  verify_retention_reconstruction "${admin_url}"
  cleanup_rehearsal_databases
  trap - EXIT
  printf 'Quilt migration rehearsal completed; disposable database removed.\n'
}

main() {
  local operation="${1:-rehearse}"
  require_command node
  require_command npm
  require_command psql
  require_command jq

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