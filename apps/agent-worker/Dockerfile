FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    AGENT_GATEWAY_MODE=fake \
    AGENT_FEATURE_MODEL_FREE_ENABLED=true \
    AGENT_FEATURE_FOUNDRY_ENABLED=false \
    AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED=false

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY README.md /app/README.md
COPY src /app/src
RUN pip install --no-cache-dir .

ENTRYPOINT ["python", "-m", "main"]
