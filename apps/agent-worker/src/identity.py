from __future__ import annotations

import threading
import time
from typing import Any, Protocol


class AccessTokenProvider(Protocol):
    def get_token(self) -> str:
        ...


class ManagedIdentityTokenProvider:
    """Acquire and refresh app-only tokens through the workload identity."""

    def __init__(self, scope: str, credential: Any | None = None, refresh_skew_seconds: int = 120) -> None:
        if not scope.strip():
            raise ValueError("managed identity token scope is required")

        self._scope = scope.strip()
        self._credential = credential
        self._refresh_skew_seconds = refresh_skew_seconds
        self._access_token: str | None = None
        self._expires_on = 0.0
        self._lock = threading.Lock()

    def get_token(self) -> str:
        now = time.time()
        if self._access_token and now < self._expires_on - self._refresh_skew_seconds:
            return self._access_token

        with self._lock:
            now = time.time()
            if self._access_token and now < self._expires_on - self._refresh_skew_seconds:
                return self._access_token

            credential = self._credential
            if credential is None:
                try:
                    from azure.identity import DefaultAzureCredential
                except ImportError as exc:
                    raise RuntimeError("azure-identity is required for managed identity authentication") from exc
                credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
                self._credential = credential

            token = credential.get_token(self._scope)
            if not token.token or token.expires_on <= now:
                raise RuntimeError("managed identity returned an invalid access token")

            self._access_token = token.token
            self._expires_on = float(token.expires_on)
            return token.token