FROM python:3.11-slim

WORKDIR /app

# Install poetry
RUN pip install --no-cache-dir poetry==2.3.4

# Copy dependency files first for layer caching
COPY pyproject.toml poetry.lock poetry.toml ./

# Install dependencies (no root package, no dev deps)
RUN poetry install --no-root --only main

# Copy application code
COPY . .

# Ensure uploads directory exists
RUN mkdir -p uploads

EXPOSE 8000
