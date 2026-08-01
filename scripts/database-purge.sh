#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# database-purge.sh
# Purge canvas, quilt, and tile rows from the Postgres database.

set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: database-purge.sh [OPTIONS]

Purge canvas, quilt, and tile data from the Postgres database.

By default, this script purges all rows from:
	- quilt-scoped authorization audit events
	- canonical world metadata
	- tiles
	- quilts
	- canvases

Use --canvas-id to purge a single canvas and its associated quilt and tiles.

Options:
	--canvas-id <uuid>       Purge only a specific canvas and its tiles
	--database-url <url>     Override DATABASE_URL / SERVER_DATABASE_URL
	--yes                    Skip interactive confirmation prompt
	--help, -h               Show this help message

Environment variables:
	DATABASE_URL             Postgres connection string (preferred)
	SERVER_DATABASE_URL      Fallback connection string

Examples:
	./scripts/database-purge.sh
	./scripts/database-purge.sh --canvas-id 00000000-0000-0000-0000-000000000000
	./scripts/database-purge.sh --yes
USAGE
}

err() {
	local message="$1"
	printf 'ERROR: %s\n' "${message}" >&2
	exit 1
}

log() {
	local message="$1"
	printf '%s\n' "${message}"
}

require_command() {
	local command_name="$1"
	if ! command -v "${command_name}" >/dev/null 2>&1; then
		err "'${command_name}' is required but not installed"
	fi
}

resolve_database_url() {
	local explicit_url="$1"
	if [[ -n "${explicit_url}" ]]; then
		printf '%s\n' "${explicit_url}"
		return
	fi

	if [[ -n "${DATABASE_URL:-}" ]]; then
		printf '%s\n' "${DATABASE_URL}"
		return
	fi

	if [[ -n "${SERVER_DATABASE_URL:-}" ]]; then
		printf '%s\n' "${SERVER_DATABASE_URL}"
		return
	fi

	err "DATABASE_URL or SERVER_DATABASE_URL must be set"
}

confirm_purge() {
	local target_label="$1"
	local bypass_confirmation="$2"

	if [[ "${bypass_confirmation}" == "true" ]]; then
		return
	fi

	printf 'About to purge %s.\n' "${target_label}"
	printf 'Type PURGE to continue: '

	local confirmation=''
	read -r confirmation

	if [[ "${confirmation}" != 'PURGE' ]]; then
		err 'Confirmation text did not match; aborting purge'
	fi
}

purge_all() {
	local db_url="$1"

	local sql=''
	sql+="BEGIN;"
	sql+=" WITH deleted AS ("
	sql+="  DELETE FROM authorization_audit_events"
	sql+="  WHERE quilt_id IS NOT NULL OR patch_id IS NOT NULL RETURNING 1"
	sql+=") SELECT count(*) AS deleted_audit_events FROM deleted;"
	sql+=" WITH deleted AS (DELETE FROM canonical_world RETURNING 1)"
	sql+=" SELECT count(*) AS deleted_canonical_worlds FROM deleted;"
	sql+=" WITH deleted AS (DELETE FROM tiles RETURNING 1)"
	sql+=" SELECT count(*) AS deleted_tiles FROM deleted;"
	sql+=" WITH deleted AS (DELETE FROM quilts RETURNING 1)"
	sql+=" SELECT count(*) AS deleted_quilts FROM deleted;"
	sql+=" WITH deleted AS (DELETE FROM canvases RETURNING 1)"
	sql+=" SELECT count(*) AS deleted_canvases FROM deleted;"
	sql+=" COMMIT;"

	psql "${db_url}" --set ON_ERROR_STOP=1 --command "${sql}"
}

purge_canvas() {
	local db_url="$1"
	local canvas_id="$2"

	# Validate UUID format before embedding in SQL to prevent injection.
	if ! [[ "${canvas_id}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
		err "canvas_id must be a valid UUID: ${canvas_id}"
	fi

	local sql=''
	sql+="BEGIN;"
	sql+=" WITH target_quilt AS ("
	sql+="  SELECT id FROM quilts WHERE legacy_canvas_id = '${canvas_id}'"
	sql+="), deleted AS ("
	sql+="  DELETE FROM authorization_audit_events"
	sql+="  WHERE quilt_id IN (SELECT id FROM target_quilt)"
	sql+="     OR patch_id IN ("
	sql+="      SELECT id FROM patches"
	sql+="      WHERE quilt_id IN (SELECT id FROM target_quilt)"
	sql+="     )"
	sql+="  RETURNING 1"
	sql+=") SELECT count(*) AS deleted_audit_events FROM deleted;"
	sql+=" WITH deleted AS ("
	sql+="  DELETE FROM canonical_world"
	sql+="  WHERE quilt_id IN ("
	sql+="   SELECT id FROM quilts WHERE legacy_canvas_id = '${canvas_id}'"
	sql+="  )"
	sql+="  RETURNING 1"
	sql+=") SELECT count(*) AS deleted_canonical_worlds FROM deleted;"
	sql+=" WITH deleted AS ("
	sql+="  DELETE FROM tiles"
	sql+="  WHERE canvas_id = '${canvas_id}'"
	sql+="     OR quilt_id IN ("
	sql+="      SELECT id FROM quilts WHERE legacy_canvas_id = '${canvas_id}'"
	sql+="     )"
	sql+="     OR anchor_patch_id IN ("
	sql+="      SELECT id FROM patches"
	sql+="      WHERE quilt_id IN ("
	sql+="       SELECT id FROM quilts WHERE legacy_canvas_id = '${canvas_id}'"
	sql+="      )"
	sql+="     )"
	sql+="  RETURNING 1"
	sql+=") SELECT count(*) AS deleted_tiles FROM deleted;"
	sql+=" WITH deleted AS ("
	sql+="  DELETE FROM quilts WHERE legacy_canvas_id = '${canvas_id}' RETURNING 1"
	sql+=") SELECT count(*) AS deleted_quilts FROM deleted;"
	sql+=" WITH deleted AS ("
	sql+="  DELETE FROM canvases WHERE id = '${canvas_id}' RETURNING 1"
	sql+=") SELECT count(*) AS deleted_canvases FROM deleted;"
	sql+=" COMMIT;"

	psql "${db_url}" \
		--set ON_ERROR_STOP=1 \
		--command "${sql}"
}

main() {
	local canvas_id=''
	local explicit_database_url=''
	local skip_confirmation='false'

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--canvas-id)
				[[ -n "${2:-}" && "${2}" != --* ]] || err '--canvas-id requires a value'
				canvas_id="$2"
				shift 2
				;;
			--database-url)
				[[ -n "${2:-}" && "${2}" != --* ]] || err '--database-url requires a value'
				explicit_database_url="$2"
				shift 2
				;;
			--yes)
				skip_confirmation='true'
				shift
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

	require_command 'psql'

	local database_url=''
	database_url="$(resolve_database_url "${explicit_database_url}")"

	if [[ -n "${canvas_id}" ]]; then
		confirm_purge \
			"canvas ${canvas_id}, its quilt, and its tiles" \
			"${skip_confirmation}"
		purge_canvas "${database_url}" "${canvas_id}"
	else
		confirm_purge 'all canvases, quilts, and tiles' "${skip_confirmation}"
		purge_all "${database_url}"
	fi

	log 'Purge complete.'
}

main "$@"
