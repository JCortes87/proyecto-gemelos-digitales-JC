"""Proxy de la API de Brightspace protegido por sesión, dividido por dominio.

El `router` combinado se re-exporta desde app/api/brightspace_proxy.py (que
es lo que incluye main.py). La lógica no-HTTP vive en app/services/brightspace/.
"""
from fastapi import APIRouter

from app.api.brightspace import content, courses, dropbox, grades, rubrics, users

router = APIRouter()
for _sub in (courses, users, content, grades, dropbox, rubrics):
    router.include_router(_sub.router)
