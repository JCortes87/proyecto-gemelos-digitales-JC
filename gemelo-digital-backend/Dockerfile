# ----------------------------------------------------------------------------
# Imagen del backend (FastAPI) — se despliega en ECS Fargate.
#
# Contexto de build: gemelo-digital-backend/ (asi lo usan deploy-backend.yml y
# el deploy manual del README). Por eso el SPA NO se compila aqui: se copia el
# bundle ya construido de frontend_dist/ (ver README > Deploy, paso 3). Compilar
# el frontend en una etapa node exigiria usar la raiz del repo como contexto.
#
# Para subir el parche de Python: cambiar el tag y reconstruir.
# ----------------------------------------------------------------------------
FROM python:3.11.16-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Datos de runtime best-effort (announcements.json, known_users.json,
    # bug_reports.jsonl) en un directorio escribible por el usuario no-root.
    GEMELO_DATA_DIR=/app/data

WORKDIR /app

# Usuario sin privilegios (uid fijo para que sea predecible en ECS/volumenes).
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

# Dependencias en una capa propia: solo se reinstalan si cambia requirements.txt.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# Codigo (propiedad de root, solo lectura para el usuario de la app).
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY config ./config
COPY app ./app
COPY main.py ./main.py
COPY start.sh ./start.sh

# main.py sirve el SPA desde <dir de main.py>/../frontend_dist. Con
# WORKDIR /app eso resuelve a /frontend_dist (igual que la imagen anterior,
# que trabajaba en /), por eso se copia a la raiz y no dentro de /app.
COPY frontend_dist /frontend_dist

# - start.sh: normalizar CRLF (si se edita en Windows el contenedor falla con
#   "exec ./start.sh: no such file or directory") y hacerlo ejecutable.
# - /app/data y /app/keys: unicos directorios escribibles por el usuario app
#   (datos best-effort y llave LTI por defecto en /app/keys/lti_private.pem).
RUN sed -i 's/\r$//' ./start.sh \
    && chmod 0755 ./start.sh \
    && mkdir -p /app/data /app/keys \
    && chown app:app /app/data /app/keys

USER app

EXPOSE 8000

# Liveness superficial contra /health (HTTP plano dentro del contenedor).
# La imagen slim no trae curl, se usa python. Nota: ECS Fargate IGNORA el
# HEALTHCHECK del Dockerfile; para que cuente hay que declarar "healthCheck"
# en la task definition (ver README > Deploy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

# start.sh corre `alembic upgrade head` (si hay DATABASE_URL) y luego uvicorn.
CMD ["./start.sh"]
