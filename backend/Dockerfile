FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Run as a dedicated non-root user.
RUN useradd --create-home --uid 10001 appuser

# Install project dependencies from pyproject.
COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir .

# Copy runtime source.
COPY main.py ./

RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

# Persist sqlite db outside the image.
VOLUME ["/app/data"]

EXPOSE 8787

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8787"]
