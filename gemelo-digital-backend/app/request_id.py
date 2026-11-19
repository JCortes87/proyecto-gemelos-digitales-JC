# app/request_id.py
# Request-id por petición: permite correlacionar lo que ve el usuario (un
# error genérico con su id) con el log completo del servidor, sin devolver
# detalles internos (str(exc), trazas) al cliente.

import logging
import re
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"
_request_id: ContextVar[str] = ContextVar("request_id", default="-")
# Solo se reutiliza un id entrante (p. ej. del ALB/CloudFront) si es "sano".
_SAFE_ID = re.compile(r"^[A-Za-z0-9._\-]{8,128}$")


def get_request_id() -> str:
    return _request_id.get()


class RequestIdMiddleware:
    """Middleware ASGI puro (no rompe streaming) que fija el request-id en un
    ContextVar y lo devuelve en la cabecera X-Request-ID."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = ""
        for name, value in scope.get("headers") or []:
            if name == b"x-request-id":
                incoming = value.decode("latin-1")
                break
        rid = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex
        # También en request.state: el handler global de excepciones corre
        # fuera de este middleware (ServerErrorMiddleware) y lo lee de ahí.
        scope.setdefault("state", {})["request_id"] = rid
        # No se hace reset del ContextVar: cada petición corre en su propia
        # tarea/contexto, y así el log del handler de 500 conserva el id.
        _request_id.set(rid)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                headers.append((b"x-request-id", rid.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_id)


class RequestIdLogFilter(logging.Filter):
    """Añade `request_id` a cada LogRecord y lo antepone al mensaje, para que
    los logs (CloudWatch) se puedan filtrar por petición."""

    def filter(self, record: logging.LogRecord) -> bool:
        rid = _request_id.get()
        record.request_id = rid
        if rid != "-" and not getattr(record, "_rid_tagged", False):
            record.msg = f"[rid={rid}] {record.msg}"
            record._rid_tagged = True
        return True


def install_log_filter(*logger_names: str) -> None:
    flt = RequestIdLogFilter()
    for name in logger_names:
        lg = logging.getLogger(name)
        if not any(isinstance(f, RequestIdLogFilter) for f in lg.filters):
            lg.addFilter(flt)
