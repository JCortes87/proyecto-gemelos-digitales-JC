"""
Endpoints administrativos del backend.

Estos endpoints son invocados por sistemas externos (typicamente AWS
EventBridge u otro scheduler) o usados manualmente durante la
configuracion inicial del entorno. NO son para consumo del frontend
ni del flujo normal de usuarios.

Seguridad:
  - /admin/sync-cron-all valida un secret compartido en el header
    X-Cron-Secret contra la env CRON_SHARED_SECRET. Sin ese match
    devuelve 401.
  - /admin/show-refresh-token requiere sesion activa de Brightspace
    (cookie gemelo_session_id o Authorization: Bearer <session_id>).
    Es una herramienta de UNA sola vez para capturar el refresh_token
    inicial; debe eliminarse del codigo despues de usar.
"""
from __future__ import annotations

import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request

from app.services.cron_runner import run_sync_for_all_courses
from app.state import get_session

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/admin", tags=["admin"])


#|---------- Validacion del secret compartido del schedule ----------|
def _validate_cron_secret(provided: Optional[str]) -> None:
    """
    Verifica que el header X-Cron-Secret coincida con el valor de la
    env CRON_SHARED_SECRET.

    Lanza:
      - 503 si el servidor no tiene CRON_SHARED_SECRET configurado
        (no permitimos ejecutar el endpoint sin secret seteado, porque
        seria un agujero abierto).
      - 401 si el header esta ausente o no coincide.
    """
    expected = os.getenv("CRON_SHARED_SECRET", "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="CRON_SHARED_SECRET no configurado en el servidor",
        )
    if not provided or provided != expected:
        raise HTTPException(
            status_code=401,
            detail="X-Cron-Secret invalido o ausente",
        )


#|---------- Endpoint principal: sincronizacion automatica de cursos ----------|
@router.post("/sync-cron-all")
async def admin_sync_cron_all(
    org_unit_ids_csv: Optional[str] = Query(
        None,
        alias="orgUnitIds",
        description=(
            "Lista opcional de orgUnitIds en formato CSV (ej. '29120,40000'). "
            "Si se omite, sincroniza TODOS los cursos con enrollments activos."
        ),
    ),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
):
    """
    Endpoint que dispara la sincronizacion de snapshots contra Brightspace
    para los cursos activos. Pensado para ser invocado por un schedule
    externo (AWS EventBridge u otro) cada N minutos, manteniendo la DB
    fresca para acelerar los dashboards.

    Auth:
        - Header X-Cron-Secret debe coincidir con la env
          CRON_SHARED_SECRET.
        - NO requiere sesion de usuario; el endpoint usa una cuenta de
          servicio cuyo refresh_token vive en la env
          BRIGHTSPACE_SERVICE_REFRESH_TOKEN.

    Comportamiento:
        - Por defecto sincroniza todos los cursos con al menos un
          enrollment activo en la DB.
        - Si se pasa el query param ?orgUnitIds=29120,40000, limita a
          esa lista (util para empezar piloto con un curso).

    Idempotente: SyncService hace upsert sobre los snapshots, asi que
    reintentos del schedule no duplican datos.

    Returns: resumen con stats agregadas y detalle por curso.
    """
    _validate_cron_secret(x_cron_secret)

    refresh_token = os.getenv("BRIGHTSPACE_SERVICE_REFRESH_TOKEN", "")
    if not refresh_token:
        raise HTTPException(
            status_code=503,
            detail="BRIGHTSPACE_SERVICE_REFRESH_TOKEN no configurado en el servidor",
        )

    #|---------- Parseo del CSV de orgUnitIds (opcional) ----------|
    org_unit_ids: Optional[List[int]] = None
    if org_unit_ids_csv:
        try:
            org_unit_ids = [
                int(x.strip())
                for x in org_unit_ids_csv.split(",")
                if x.strip()
            ]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="orgUnitIds debe ser una lista CSV de enteros (ej. '29120,40000')",
            )

    logger.info(
        "sync-cron-all disparado (orgUnitIds=%s)",
        org_unit_ids if org_unit_ids else "TODOS",
    )

    result = await run_sync_for_all_courses(refresh_token, org_unit_ids)

    #|---------- Si la mintada inicial fallo, devolvemos 502 para que el schedule lo note ----------|
    if not result.get("ok") and result.get("totalCourses", 0) == 0 and result.get("error"):
        # Caso: refresh_token roto o Brightspace caido — el schedule
        # debe registrar el error y posiblemente alertar.
        raise HTTPException(status_code=502, detail=result["error"])

    # Caso: todos OK, o falla parcial (algunos cursos OK, otros no).
    # Devolvemos 200 con el resumen para que el schedule lo loguee.
    return result


#|---------- Captura inicial del refresh_token (HERRAMIENTA TEMPORAL) ----------|
@router.get("/show-refresh-token")
def admin_show_refresh_token(request: Request):
    """
    HERRAMIENTA DE CONFIGURACION INICIAL.

    Expone el refresh_token de la sesion actual para que el operador
    pueda copiarlo a la env BRIGHTSPACE_SERVICE_REFRESH_TOKEN del
    taskdef de produccion.

    Solo se usa UNA vez durante el setup del schedule:
      1. El operador (tipicamente quien hace el deploy) se loguea en
         /auth/brightspace/login con la cuenta que sera dueña del sync.
      2. Visita este endpoint y copia el refresh_token de la respuesta.
      3. Lo agrega a la env de produccion.
      4. ELIMINA este endpoint del codigo (commit dedicado).

    Auth: requiere sesion activa (cookie gemelo_session_id o
    Authorization: Bearer <session_id>).

    Devuelve un JSON con:
      - refresh_token: el string a copiar.
      - user: datos del dueño del token (para confirmar identidad).
      - warning + instructions: recordatorios visibles para no olvidar
        eliminar el endpoint despues.
    """
    SESSION_COOKIE = "gemelo_session_id"

    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            sid = auth[7:].strip() or None

    if not sid:
        raise HTTPException(
            status_code=401,
            detail=(
                "No autenticado. Inicie sesion en /auth/brightspace/login "
                "con la cuenta que sera dueña del refresh_token."
            ),
        )

    session = get_session(sid)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Sesion expirada. Vuelva a loguearse.",
        )

    refresh_token = session.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail=(
                "La sesion actual no tiene refresh_token guardado. "
                "Posible causa: login realizado antes de que el backend "
                "persistiera el refresh_token. Cierre sesion y vuelva "
                "a loguearse."
            ),
        )

    return {
        "warning": (
            "ENDPOINT TEMPORAL — eliminar del codigo tras capturar el token"
        ),
        "refresh_token": refresh_token,
        "user": {
            "user_id": session.get("user_id"),
            "user_name": session.get("user_name"),
            "user_email": session.get("user_email"),
        },
        "instructions": (
            "Copie 'refresh_token' a la env BRIGHTSPACE_SERVICE_REFRESH_TOKEN "
            "del taskdef.json (o equivalente en su entorno) y elimine este "
            "endpoint del codigo en el siguiente deploy."
        ),
    }
