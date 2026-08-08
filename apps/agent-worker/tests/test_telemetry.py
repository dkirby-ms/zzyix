from __future__ import annotations

from telemetry import configure_azure_monitor_from_env


def test_given_connection_string_when_configuring_then_initializes_azure_monitor(monkeypatch) -> None:
    calls = []
    monkeypatch.setenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "InstrumentationKey=test")

    configured = configure_azure_monitor_from_env(lambda **kwargs: calls.append(kwargs))

    assert configured is True
    assert calls == [{"connection_string": "InstrumentationKey=test"}]


def test_given_no_connection_string_when_configuring_then_skips_exporter(monkeypatch) -> None:
    monkeypatch.delenv("APPLICATIONINSIGHTS_CONNECTION_STRING", raising=False)

    configured = configure_azure_monitor_from_env()

    assert configured is False