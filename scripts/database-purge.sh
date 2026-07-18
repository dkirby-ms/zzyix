#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# database-purge.sh
# Purge canvas and tile rows from the Postgres database.

set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: database-purge.sh [OPTIONS]

Purge canvas and tile data from the Postgres database.

By default, this script purges all rows from:
	- tiles
	- canvases

Use --canvas-id to purge a single canvas and its tiles.

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
	sql+="WITH deleted_tiles AS ("
	sql+=" DELETE FROM tiles RETURNING 1"
	sql+=")"
	sql+=", deleted_canvases AS ("
	sql+=" DELETE FROM canvases RETURNING 1"
	sql+=")"
	sql+=" SELECT"
	sql+="  (SELECT count(*) FROM deleted_tiles) AS deleted_tiles,"
	sql+="  (SELECT count(*) FROM deleted_canvases) AS deleted_canvases;"

	psql "${db_url}" --set ON_ERROR_STOP=1 --command "${sql}"
}

purge_canvas() {
	local db_url="$1"
	local canvas_id="$2"

	local sql=''
	sql+="WITH deleted_tiles AS ("
	sql+=" DELETE FROM tiles WHERE canvas_id = :'canvas_id' RETURNING 1"
	sql+=")"
	sql+=", deleted_canvases AS ("
	sql+=" DELETE FROM canvases WHERE id = :'canvas_id' RETURNING 1"
	sql+=")"
	sql+=" SELECT"
	sql+="  (SELECT count(*) FROM deleted_tiles) AS deleted_tiles,"
	sql+="  (SELECT count(*) FROM deleted_canvases) AS deleted_canvases;"

	psql "${db_url}" \
		--set ON_ERROR_STOP=1 \
		--set "canvas_id=${canvas_id}" \
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
		confirm_purge "canvas ${canvas_id} and its tiles" "${skip_confirmation}"
		purge_canvas "${database_url}" "${canvas_id}"
	else
		confirm_purge 'all canvases and tiles' "${skip_confirmation}"
		purge_all "${database_url}"
	fi

	log 'Purge complete.'
}

main "$@"
