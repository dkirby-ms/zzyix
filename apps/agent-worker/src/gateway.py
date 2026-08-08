from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Protocol
from urllib.request import Request, urlopen

from telemetry import emit_event


SAFE_ACTION_TYPE = "observe"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GatewayLimits:
    max_prompt_chars: int = 8_000
    max_tool_bytes: int = 64_000
    max_attempts: int = 2
    timeout_seconds: float = 3.0
    rate_limit_per_minute: int = 30
    max_concurrency: int = 4


@dataclass(frozen=True)
class GatewayRequest:
    run_id: str
    quilt_id: str
    prompt: str
    tool_context: dict[str, Any]


@dataclass(frozen=True)
class GatewayResponse:
    provider: str
    model: str
    request_id: str | None
    structured_output: dict[str, Any]
    used_fallback: bool
    fallback_reason: str | None


class ModelGateway(Protocol):
    def generate(self, request: GatewayRequest) -> GatewayResponse:
        ...


class FakeGateway(ModelGateway):
    def generate(self, request: GatewayRequest) -> GatewayResponse:
        digest = sha256(_canonical_json(request.tool_context).encode("utf-8")).hexdigest()[:12]

        return GatewayResponse(
            provider="fake",
            model="deterministic-v1",
            request_id=f"fake-{request.run_id[:8]}",
            structured_output={
                "summary": f"Read-only context digest {digest}",
                "actions": [{"type": SAFE_ACTION_TYPE, "target": request.quilt_id}],
            },
            used_fallback=False,
            fallback_reason=None,
        )


class GovernedGateway(ModelGateway):
    def __init__(
        self,
        mode: str,
        limits: GatewayLimits,
        model: str = "gpt-4.1-mini",
        foundry_endpoint: str | None = None,
        foundry_api_key: str | None = None,
    ) -> None:
        self._mode = mode
        self._limits = limits
        self._model = model
        self._foundry_endpoint = foundry_endpoint
        self._foundry_api_key = foundry_api_key
        self._active = threading.BoundedSemaphore(value=max(1, limits.max_concurrency))
        self._call_window: deque[float] = deque()
        self._window_lock = threading.Lock()

    def generate(self, request: GatewayRequest) -> GatewayResponse:
        self._apply_preflight_limits(request)
        tool_bytes = len(_canonical_json(request.tool_context).encode("utf-8"))
        emit_event(
            "gateway_preflight",
            run_id=request.run_id,
            quilt_id=request.quilt_id,
            mode=self._mode,
            prompt_chars=len(request.prompt),
            tool_bytes=tool_bytes,
        )

        acquired = self._active.acquire(blocking=False)
        if not acquired:
            emit_event("gateway_fallback", run_id=request.run_id, reason="concurrency_limit")
            return _fallback_response(request, "concurrency_limit")

        try:
            if self._mode == "fake":
                return FakeGateway().generate(request)

            return self._generate_foundry(request)
        finally:
            self._active.release()

    def _generate_foundry(self, request: GatewayRequest) -> GatewayResponse:
        payload = {
            "messages": [
                {"role": "system", "content": "Return read-only JSON output."},
                {"role": "user", "content": request.prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "max_tokens": 400,
        }

        for attempt in range(1, self._limits.max_attempts + 1):
            try:
                raw = self._execute_provider_call(payload)
                structured = _extract_structured_output(raw)
                return GatewayResponse(
                    provider="azure-ai-foundry",
                    model=self._model,
                    request_id=raw.get("id") if isinstance(raw, dict) else None,
                    structured_output=structured,
                    used_fallback=False,
                    fallback_reason=None,
                )
            except TimeoutError:
                if attempt >= self._limits.max_attempts:
                    emit_event("gateway_fallback", run_id=request.run_id, reason="timeout", attempts=attempt)
                    return _fallback_response(request, "timeout")
            except Exception:
                if attempt >= self._limits.max_attempts:
                    emit_event("gateway_fallback", run_id=request.run_id, reason="provider_failure", attempts=attempt)
                    return _fallback_response(request, "provider_failure")

        return _fallback_response(request, "provider_failure")

    def _execute_provider_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self._foundry_endpoint or not self._foundry_api_key:
            raise RuntimeError("foundry configuration missing")

        body = json.dumps(payload).encode("utf-8")
        request = Request(
            url=self._foundry_endpoint,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "api-key": self._foundry_api_key,
            },
            data=body,
        )

        try:
            with urlopen(request, timeout=self._limits.timeout_seconds) as response:  # noqa: S310
                return json.loads(response.read().decode("utf-8"))
        except OSError as exc:
            raise TimeoutError("gateway timeout") from exc

    def _apply_preflight_limits(self, request: GatewayRequest) -> None:
        if len(request.prompt) > self._limits.max_prompt_chars:
            raise ValueError("prompt exceeds max_prompt_chars")

        tool_bytes = len(_canonical_json(request.tool_context).encode("utf-8"))
        if tool_bytes > self._limits.max_tool_bytes:
            raise ValueError("tool_context exceeds max_tool_bytes")

        now = time.time()
        with self._window_lock:
            while self._call_window and (now - self._call_window[0]) > 60.0:
                self._call_window.popleft()

            if len(self._call_window) >= self._limits.rate_limit_per_minute:
                emit_event("gateway_rate_limited", window_size=len(self._call_window))
                raise ValueError("rate limit exceeded")

            self._call_window.append(now)


def _extract_structured_output(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("provider response must be an object")

    choices = raw.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("provider response missing choices")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise ValueError("provider message content must be a string")

    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("structured content must be an object")

    summary = parsed.get("summary")
    actions = parsed.get("actions")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("summary must be a non-empty string")
    if not isinstance(actions, list):
        raise ValueError("actions must be a list")

    safe_actions = []
    for action in actions:
        if not isinstance(action, dict):
            raise ValueError("action must be an object")

        action_type = action.get("type")
        target = action.get("target")
        if action_type != SAFE_ACTION_TYPE or not isinstance(target, str) or not target:
            raise ValueError("unsafe action")

        safe_actions.append({"type": SAFE_ACTION_TYPE, "target": target})

    return {
        "summary": summary[:500],
        "actions": safe_actions[:5],
    }


def _fallback_response(request: GatewayRequest, reason: str) -> GatewayResponse:
    return GatewayResponse(
        provider="fallback",
        model="deterministic-safety-fallback",
        request_id=f"fallback-{request.run_id[:8]}",
        structured_output={
            "summary": "Provider unavailable; returning deterministic observation-only fallback.",
            "actions": [{"type": SAFE_ACTION_TYPE, "target": request.quilt_id}],
        },
        used_fallback=True,
        fallback_reason=reason,
    )


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))
