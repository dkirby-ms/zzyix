from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from telemetry import emit_event


UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)
MAX_EVENT_LIMIT = 500
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QuiltContextInput:
    quilt_id: str


@dataclass(frozen=True)
class PatchSnapshotInput:
    patch_id: str
    surface: Literal["fineData", "aggregateData"] | None = None


@dataclass(frozen=True)
class PatchEventsInput:
    patch_id: str
    after_op_seq: int = 0
    limit: int = 200


class AgentReadTools:
    def __init__(self, base_url: str, bearer_token: str | None = None, timeout_seconds: float = 5.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._bearer_token = bearer_token
        self._timeout_seconds = timeout_seconds

    def get_quilt_context(self, request: QuiltContextInput) -> dict[str, Any]:
        _require_uuid(request.quilt_id, "quilt_id")

        payload = self._read_json(f"/quilts/{request.quilt_id}/context", "get_quilt_context")
        redacted = _redact_quilt_context(_require_object(payload))
        emit_event(
            "worker_tool_call",
            tool="get_quilt_context",
            quilt_id=request.quilt_id,
            patch_count=redacted.get("patchCount"),
        )
        return redacted

    def get_patch_snapshot(self, request: PatchSnapshotInput) -> dict[str, Any]:
        _require_uuid(request.patch_id, "patch_id")

        query: dict[str, str] = {}
        if request.surface is not None:
            query["surface"] = request.surface

        suffix = "" if not query else f"?{urlencode(query)}"
        payload = self._read_json(f"/patches/{request.patch_id}/snapshot{suffix}", "get_patch_snapshot")
        redacted = _redact_snapshot(_require_object(payload))
        emit_event(
            "worker_tool_call",
            tool="get_patch_snapshot",
            patch_id=request.patch_id,
            surface=request.surface,
            tile_count=redacted.get("tileCount"),
        )
        return redacted

    def get_patch_events(self, request: PatchEventsInput) -> dict[str, Any]:
        _require_uuid(request.patch_id, "patch_id")
        if request.after_op_seq < 0:
            raise ValueError("after_op_seq must be non-negative")
        if request.limit <= 0 or request.limit > MAX_EVENT_LIMIT:
            raise ValueError(f"limit must be in range 1..{MAX_EVENT_LIMIT}")

        query = urlencode({"afterOpSeq": request.after_op_seq, "limit": request.limit})
        payload = self._read_json(f"/patches/{request.patch_id}/events?{query}", "get_patch_events")
        redacted = _redact_events(_require_object(payload))
        emit_event(
            "worker_tool_call",
            tool="get_patch_events",
            patch_id=request.patch_id,
            after_op_seq=request.after_op_seq,
            requested_limit=request.limit,
            operation_count=redacted.get("operationCount"),
        )
        return redacted

    def _read_json(self, path: str, tool_name: str) -> Any:
        headers = {"Accept": "application/json"}
        if self._bearer_token:
            headers["Authorization"] = f"Bearer {self._bearer_token}"

        request = Request(
            url=f"{self._base_url}/internal/v1/agent{path}",
            method="GET",
            headers=headers,
        )

        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:  # noqa: S310
                body = response.read().decode("utf-8")
                return json.loads(body)
        except Exception as exc:
            emit_event("worker_tool_failure", tool=tool_name, error_type=type(exc).__name__)
            raise


def _require_uuid(value: str, field_name: str) -> None:
    if not UUID_PATTERN.match(value):
        raise ValueError(f"{field_name} must be a UUID")


def _require_object(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("tool response must be a JSON object")

    return payload


def _redact_quilt_context(payload: dict[str, Any]) -> dict[str, Any]:
    topology = payload.get("topology")
    patches = payload.get("patches")

    safe_topology = topology if isinstance(topology, dict) else {}
    patch_count = len(patches) if isinstance(patches, list) else 0

    return {
        "topology": {
            "quiltId": safe_topology.get("quiltId"),
            "protocolVersion": safe_topology.get("protocolVersion"),
            "topology": safe_topology.get("topology"),
            "patchRows": safe_topology.get("patchRows"),
            "patchColumns": safe_topology.get("patchColumns"),
        },
        "patchCount": patch_count,
    }


def _redact_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "patchId": payload.get("patchId"),
        "surface": payload.get("surface"),
        "revision": payload.get("revision"),
        "tileCount": payload.get("tileCount"),
    }


def _redact_events(payload: dict[str, Any]) -> dict[str, Any]:
    operations = payload.get("operations", [])
    if not isinstance(operations, list):
        raise ValueError("operations must be a list")

    safe_operations = []
    for operation in operations:
        if not isinstance(operation, dict):
            continue

        safe_operations.append({
            "eventId": operation.get("eventId"),
            "opSeq": operation.get("opSeq"),
            "opType": operation.get("opType"),
            "createdAt": operation.get("createdAt"),
        })

    return {
        "operations": safe_operations,
        "operationCount": len(safe_operations),
    }
