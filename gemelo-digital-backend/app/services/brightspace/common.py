"""Tipos compartidos por los servicios del proxy Brightspace."""
from __future__ import annotations

from typing import Any


class UpstreamError(Exception):
    """Respuesta no-200 de Brightspace que el handler devuelve tal cual:
    ``JSONResponse(status_code=e.status, content=e.content)``.

    Permite que la lógica viva fuera de los routers sin cambiar las
    respuestas de error que ya devolvían los endpoints."""

    def __init__(self, status: int, content: Any):
        super().__init__(status)
        self.status = status
        self.content = content
