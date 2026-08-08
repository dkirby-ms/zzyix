from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from tools import AgentReadTools, PatchEventsInput, PatchSnapshotInput, QuiltContextInput


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path.endswith("/events?afterOpSeq=0&limit=2"):
            payload = {
                "operations": [
                    {
                        "eventId": "e1",
                        "opSeq": 1,
                        "opType": "tile_placed",
                        "createdAt": 10,
                        "payload": {"sensitive": True},
                    }
                ]
            }
        elif self.path.endswith("/context"):
            payload = {
                "topology": {
                    "quiltId": "40000000-0000-4000-8000-000000000001",
                    "protocolVersion": 2,
                    "topology": "bounded",
                    "patchRows": 2,
                    "patchColumns": 2,
                },
                "patches": [1, 2],
            }
        else:
            payload = {"patchId": "p1", "surface": "fineData", "revision": 12, "tileCount": 100}

        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        del format
        del args


def _start_server() -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{server.server_port}"


def test_given_events_response_when_fetching_then_payload_is_redacted() -> None:
    server, base_url = _start_server()
    tools = AgentReadTools(base_url=base_url)

    try:
        response = tools.get_patch_events(
            PatchEventsInput(
                patch_id="50000000-0000-4000-8000-000000000001",
                after_op_seq=0,
                limit=2,
            )
        )
    finally:
        server.shutdown()
        server.server_close()

    assert response["operationCount"] == 1
    assert "payload" not in response["operations"][0]


def test_given_invalid_event_limit_when_fetching_then_raises() -> None:
    tools = AgentReadTools(base_url="http://127.0.0.1:1")

    try:
        tools.get_patch_events(
            PatchEventsInput(
                patch_id="50000000-0000-4000-8000-000000000001",
                after_op_seq=0,
                limit=600,
            )
        )
    except ValueError as exc:
        assert "limit" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_given_oversized_context_when_fetching_then_rejects_serialized_response(monkeypatch) -> None:
    tools = AgentReadTools(base_url="http://127.0.0.1:1")
    monkeypatch.setattr(tools, "_read_json", lambda *_args: {"topology": {"topology": "x" * 64_000}, "patches": []})

    try:
        tools.get_quilt_context(QuiltContextInput(quilt_id="40000000-0000-4000-8000-000000000001"))
    except ValueError as exc:
        assert "serialized response bytes" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_given_oversized_snapshot_when_fetching_then_rejects_serialized_response(monkeypatch) -> None:
    tools = AgentReadTools(base_url="http://127.0.0.1:1")
    monkeypatch.setattr(tools, "_read_json", lambda *_args: {"patchId": "x" * 64_000})

    try:
        tools.get_patch_snapshot(PatchSnapshotInput(patch_id="50000000-0000-4000-8000-000000000001"))
    except ValueError as exc:
        assert "serialized response bytes" in str(exc)
    else:
        raise AssertionError("expected ValueError")
