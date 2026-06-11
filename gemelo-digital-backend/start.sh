#!/bin/bash
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[startup] Running database migrations..."
  alembic upgrade head
  echo "[startup] Migrations complete."
else
  echo "[startup] DATABASE_URL not set — skipping migrations (DB features disabled)."
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000
