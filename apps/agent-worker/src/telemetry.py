from __future__ import annotations

import json
import logging
from hashlib import sha256
from typing import Any


logger = logging.getLogger("zzyix.agent-worker.telemetry")


def emit_event(event: str, **fields: Any) -> None:
    """Write operational evidence without serializing prompts or tool payloads."""
    safe_fields: dict[str, str | int | float | bool | None] = {
        "telemetry_event": event,
        "payload_redacted": True,
    }
    for key, value in fields.items():
        if key in {"prompt", "tool_context", "payload", "response", "structured_output"}:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe_fields[key] = _redact_identifier(key, value)

    logger.info(json.dumps(safe_fields, sort_keys=True, separators=(",", ":")))


def _redact_identifier(key: str, value: str | int | float | bool | None) -> str | int | float | bool | None:
    if value is None or not isinstance(value, str):
        return value
    if key.endswith("_id") or key in {"quilt_id", "patch_id", "run_id", "trigger_id"}:
        return sha256(value.encode("utf-8")).hexdigest()[:16]
    return value