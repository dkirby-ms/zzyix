from __future__ import annotations

import logging
import os
import sys

from control_plane import InMemoryControlPlane, PostgresControlPlane
from gateway import FakeGateway, GatewayLimits, GovernedGateway
from supervisor import AgentSupervisor, load_config_from_env
from telemetry import emit_event
from tools import AgentReadTools
from workflow import GraphWorkflow

EXIT_SUCCESS = 0
EXIT_FAILURE = 1
EXIT_ERROR = 2


def configure_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def parse_bool_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    return default


def build_supervisor() -> AgentSupervisor:
    config = load_config_from_env()

    control_plane_dsn = os.getenv("AGENT_CONTROL_PLANE_DSN")
    if control_plane_dsn:
        control_plane = PostgresControlPlane(control_plane_dsn)
    else:
        control_plane = InMemoryControlPlane()

    tools = AgentReadTools(
        base_url=os.getenv("AGENT_SERVER_BASE_URL", "http://127.0.0.1:3001"),
        bearer_token=os.getenv("AGENT_SERVER_BEARER_TOKEN"),
        timeout_seconds=float(os.getenv("AGENT_TOOL_TIMEOUT_SECONDS", "5")),
    )

    gateway_mode = os.getenv("AGENT_GATEWAY_MODE", "fake").strip().lower()
    model_free_enabled = parse_bool_flag("AGENT_FEATURE_MODEL_FREE_ENABLED", True)
    foundry_enabled = parse_bool_flag("AGENT_FEATURE_FOUNDRY_ENABLED", False)
    structured_proposals_enabled = parse_bool_flag("AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED", False)
    emit_event(
        "worker_feature_gates",
        model_free_enabled=model_free_enabled,
        foundry_enabled=foundry_enabled,
        structured_proposals_enabled=structured_proposals_enabled,
        gateway_mode=gateway_mode,
    )
    limits = GatewayLimits(
        max_prompt_chars=int(os.getenv("AGENT_GATEWAY_MAX_PROMPT_CHARS", "8000")),
        max_tool_bytes=int(os.getenv("AGENT_GATEWAY_MAX_TOOL_BYTES", "64000")),
        max_attempts=int(os.getenv("AGENT_GATEWAY_MAX_ATTEMPTS", "2")),
        timeout_seconds=float(os.getenv("AGENT_GATEWAY_TIMEOUT_SECONDS", "3")),
        rate_limit_per_minute=int(os.getenv("AGENT_GATEWAY_RATE_LIMIT_PER_MINUTE", "30")),
        max_concurrency=int(os.getenv("AGENT_GATEWAY_MAX_CONCURRENCY", "4")),
    )

    if gateway_mode == "fake" or not foundry_enabled:
        if gateway_mode != "fake" and not foundry_enabled:
            logging.info("gateway_feature_gate_disabled mode=%s", gateway_mode)
        gateway = FakeGateway()
    else:
        gateway = GovernedGateway(
            mode="foundry",
            limits=limits,
            model=os.getenv("AGENT_GATEWAY_MODEL", "gpt-4.1-mini"),
            foundry_endpoint=os.getenv("AGENT_FOUNDRY_ENDPOINT"),
            foundry_api_key=os.getenv("AGENT_FOUNDRY_API_KEY"),
        )

    workflow = GraphWorkflow(
        tools=tools,
        gateway=gateway,
        policy_version=os.getenv("AGENT_POLICY_VERSION", "v1"),
        framework_version=os.getenv("AGENT_FRAMEWORK_VERSION", "mvp"),
        structured_proposals_enabled=structured_proposals_enabled,
    )

    return AgentSupervisor(config=config, control_plane=control_plane, workflow=workflow)


def main() -> int:
    configure_logging()

    try:
        supervisor = build_supervisor()
    except ValueError as exc:
        logging.error("configuration_error: %s", exc)
        return EXIT_ERROR
    except Exception as exc:  # pragma: no cover
        logging.error("initialization_error: %s", exc)
        return EXIT_FAILURE

    try:
        supervisor.run_forever()
    except KeyboardInterrupt:
        logging.info("worker interrupted")
        return 130
    except Exception as exc:  # pragma: no cover
        logging.exception("worker_crash: %s", exc)
        return EXIT_FAILURE

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
