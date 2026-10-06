"""Proxy Brightspace: contenido del curso (topics, consumo, root)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.deps import (
    BRIGHTSPACE_BASE_URL,
    LE_VERSION,
    _require_token_from_request,
    _auth_headers,
    _bs_get,
)
from app.services.brightspace.common import UpstreamError
from app.services.brightspace.content import (
    build_content_consumption,
    build_content_topics,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/course/{org_unit_id}/content/topics")
async def brightspace_content_topics(request: Request, org_unit_id: int):
    """Elementos de contenido del curso con metadatos completos (Url,
    TopicType, ActivityType), recorriendo la estructura de cada módulo.
    El /content/root/ solo trae 'shells' sin Url, y sin la Url no se puede
    saber el tipo de archivo (PDF, Word, etc.).

    Devuelve {count, items: [{Id, Title, Url, TopicType, ActivityType,
    IsHidden, LastModifiedDate, EmbeddedLinks?}], moduleLinks}.
    - EmbeddedLinks solo viene en las páginas HTML internas: son los href
      encontrados en el cuerpo de la página (los archivos enlazados también
      cuentan como recursos).
    - moduleLinks son los href encontrados en la DESCRIPCIÓN de las unidades
      (módulos) visibles: los profesores publican enlaces ahí y no generan
      un topic, así que sin esto no aparecerían en el conteo de recursos.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    try:
        return await build_content_topics(headers, org_unit_id)
    except UpstreamError as e:
        return JSONResponse(status_code=e.status, content=e.content)


@router.get("/brightspace/course/{org_unit_id}/content/consumption")
async def brightspace_content_consumption(request: Request, org_unit_id: int):
    """Resumen de consumo de contenidos por estudiante: cuantos temas del
    curso ha visitado cada uno segun el user progress de Brightspace
    (scope content:completions:read, ya incluido en el SCOPE por defecto).

    Devuelve {perUser: {userId: temasVisitados}, usersQueried, usersWithData}.
    Best-effort: si Brightspace no expone el progreso (403/404) devuelve
    perUser vacio para que el frontend muestre "no disponible".
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    try:
        return await build_content_consumption(headers, org_unit_id)
    except UpstreamError as e:
        return JSONResponse(status_code=e.status, content=e.content)


@router.get("/brightspace/course/{org_unit_id}/content/root")
async def brightspace_content_root(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
