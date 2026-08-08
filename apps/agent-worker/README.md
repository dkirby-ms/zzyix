# Agent Worker MVP

Read-only Fantome resident-agent worker prototype.

## Run tests

```bash
python -m pytest tests
```

## Run worker

```bash
export AGENT_PRINCIPAL_ID=11111111-1111-4111-8111-111111111111
export AGENT_CONTROL_PLANE_DSN='postgresql://agent_control_worker:...'
export AGENT_SERVER_TOKEN_SCOPE='api://zzyix-agent-reader/.default'
python -m main
```

The worker acquires and refreshes app-only tokens through its managed identity. Static server or Foundry tokens are not supported.

## Test-only static server token mode

For local integration tests, the worker can bypass managed identity and send a fixed bearer token:

```bash
export NODE_ENV=test
export AGENT_USE_STATIC_SERVER_TOKEN=true
export AGENT_TEST_STATIC_SERVER_TOKEN='test-worker-token'
python -m main
```

`AGENT_USE_STATIC_SERVER_TOKEN` is rejected unless `NODE_ENV=test`.
