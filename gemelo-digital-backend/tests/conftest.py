"""Fixtures compartidas de la suite."""
import pytest


@pytest.fixture(autouse=True)
def _sin_postgres_para_sesiones(request, monkeypatch):
    """Los tests no deben escribir sesiones en la BD real del .env: se
    desactiva el respaldo en Postgres salvo en los tests que lo prueban
    explícitamente (marcados con @pytest.mark.session_db)."""
    if request.node.get_closest_marker("session_db"):
        return
    from app.services import session_store_db
    monkeypatch.setattr(session_store_db, "_submit", lambda *a, **k: None)
    monkeypatch.setattr(session_store_db, "fetch", lambda sid, **kw: None)
