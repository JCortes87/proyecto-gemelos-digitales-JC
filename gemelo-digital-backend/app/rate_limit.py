from __future__ import annotations


from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


# Nº de proxies de confianza delante de la app (ALB = 1). Cada proxy AÑADE la
# IP que vio al final de X-Forwarded-For; los valores de la izquierda los
# controla el cliente, así que usarlos permitiría saltarse el rate limit.
TRUSTED_PROXY_HOPS = max(int(settings.trusted_proxy_hops or 1), 1)


def client_ip(request) -> str:
    # Detrás del ALB el peer es el balanceador; usar la IP que vio el último
    # proxy de confianza (no la primera de la lista, que es falsificable).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        hops = [h.strip() for h in fwd.split(",") if h.strip()]
        if hops:
            return hops[-min(TRUSTED_PROXY_HOPS, len(hops))]
    return get_remote_address(request)


RATE_LIMIT_ENABLED = settings.rate_limit_enabled.lower() not in ("0", "false")

limiter = Limiter(key_func=client_ip, enabled=RATE_LIMIT_ENABLED)
