from __future__ import annotations

from gateway import GatewayLimits, GatewayRequest, GovernedGateway


def _request() -> GatewayRequest:
    return GatewayRequest(
        run_id="run-1",
        quilt_id="40000000-0000-4000-8000-000000000001",
        prompt="summarize",
        tool_context={"context": {"patchCount": 1}},
    )


def test_given_fake_gateway_mode_when_generating_then_returns_deterministic_output() -> None:
    gateway = GovernedGateway(mode="fake", limits=GatewayLimits())

    first = gateway.generate(_request())
    second = gateway.generate(_request())

    assert first.structured_output == second.structured_output
    assert first.used_fallback is False


def test_given_prompt_over_limit_when_generating_then_raises() -> None:
    gateway = GovernedGateway(mode="fake", limits=GatewayLimits(max_prompt_chars=2))
    request = GatewayRequest(
        run_id="run-1",
        quilt_id="40000000-0000-4000-8000-000000000001",
        prompt="this prompt is too long",
        tool_context={"context": {}},
    )

    try:
        gateway.generate(request)
    except ValueError as exc:
        assert "max_prompt_chars" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_given_foundry_failure_when_generating_then_returns_fallback() -> None:
    gateway = GovernedGateway(
        mode="foundry",
        limits=GatewayLimits(max_attempts=1),
        foundry_endpoint=None,
        foundry_api_key=None,
    )

    response = gateway.generate(_request())

    assert response.used_fallback is True
    assert response.fallback_reason == "provider_failure"


def test_given_rate_limit_exceeded_when_generating_then_raises() -> None:
    gateway = GovernedGateway(mode="fake", limits=GatewayLimits(rate_limit_per_minute=1))
    gateway.generate(_request())

    try:
        gateway.generate(_request())
    except ValueError as exc:
        assert "rate limit" in str(exc)
    else:
        raise AssertionError("expected ValueError")
