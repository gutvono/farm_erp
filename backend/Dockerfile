FROM python:3.11-slim

WORKDIR /app

# Install poetry
RUN pip install --no-cache-dir poetry==2.3.4

# Copy dependency files first for layer caching
COPY pyproject.toml poetry.lock poetry.toml ./

# Install dependencies (no root package, no dev deps).
# Resiliência a falhas transitórias de rede no build (ex.: BrokenPipeError do PyPI):
#  - installer.max-workers limita o paralelismo de downloads (broken pipe sob muitas
#    conexões simultâneas; o padrão pode abrir até 10);
#  - retry com backoff cobre qualquer soluço de rede residual antes de desistir.
# Em caso de sucesso o comportamento é idêntico ao anterior (mesmas deps, mesmo cache).
RUN poetry config installer.max-workers 4 \
    && for attempt in 1 2 3; do \
        echo "poetry install (tentativa ${attempt}/3)"; \
        poetry install --no-root --only main && break; \
        if [ "${attempt}" -eq 3 ]; then \
            echo "poetry install falhou após 3 tentativas" >&2; exit 1; \
        fi; \
        echo "Falha transitória; nova tentativa em $((attempt * 5))s..."; \
        sleep $((attempt * 5)); \
    done

# Copy application code
COPY . .

# Ensure uploads directory exists and entrypoint is executable
RUN mkdir -p uploads && chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
