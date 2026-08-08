from dataclasses import dataclass
import time

from identity import ManagedIdentityTokenProvider


@dataclass
class _Token:
    token: str
    expires_on: float


class _Credential:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def get_token(self, scope: str) -> _Token:
        self.calls.append(scope)
        return _Token(token=f"token-{len(self.calls)}", expires_on=time.time() + (60 if len(self.calls) == 1 else 3_600))


def test_given_managed_identity_token_near_expiry_then_refreshes_before_request() -> None:
    credential = _Credential()
    provider = ManagedIdentityTokenProvider("api://reader/.default", credential=credential)

    assert provider.get_token() == "token-1"
    assert provider.get_token() == "token-2"
    assert credential.calls == ["api://reader/.default", "api://reader/.default"]