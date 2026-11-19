"""Tests del respaldo de sesiones en Postgres (session_store_db):
cifrado de `data`, hash de la PK, compatibilidad con filas legacy y orden
de las escrituras (un delete nunca queda pisado por un upsert anterior).
Usa SQLite en memoria en lugar de la BD real.
"""
import json
import time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import state
from app.db.models import AppSession
from app.services import session_store_db as ssd

pytestmark = pytest.mark.session_db


@pytest.fixture
def sqlite_db(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    AppSession.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    import app.db.session as db_session
    monkeypatch.setattr(db_session, "SessionLocal", Session)
    monkeypatch.setattr(ssd, "_db_down_until", 0.0)
    state.SESSION_STORE.clear()
    yield Session
    ssd.flush()
    state.SESSION_STORE.clear()


def _entry(**kw):
    now = time.time()
    base = {"access_token": "tok-secreto", "refresh_token": "ref-secreto",
            "expires_at": now + 3600, "iat": now, "user_id": "1"}
    base.update(kw)
    return base


def _rows(Session):
    with Session() as db:
        return db.query(AppSession).all()


def test_guarda_pk_hasheada_y_data_cifrada(sqlite_db):
    ssd.upsert_async("sid-abc", _entry(), 3600)
    ssd.flush()
    rows = _rows(sqlite_db)
    assert len(rows) == 1
    assert rows[0].session_id != "sid-abc"
    assert len(rows[0].session_id) == 64
    assert "tok-secreto" not in rows[0].data
    assert rows[0].data.startswith("enc:v1:")
    assert ssd.fetch("sid-abc")["access_token"] == "tok-secreto"


def test_lee_filas_legacy_en_claro(sqlite_db):
    from datetime import datetime, timedelta
    with sqlite_db() as db:
        db.add(AppSession(
            session_id="sid-legacy",
            data=json.dumps(_entry(access_token="tok-viejo")),
            expires_at=datetime.utcnow() + timedelta(hours=1),
            purge_after=datetime.utcnow() + timedelta(hours=8),
            updated_at=datetime.utcnow(),
        ))
        db.commit()
    assert ssd.fetch("sid-legacy")["access_token"] == "tok-viejo"
    # Al reescribirla se migra a PK hasheada y se borra la fila legacy.
    ssd.upsert_async("sid-legacy", _entry(access_token="tok-viejo"), 3600)
    ssd.flush()
    ids = [r.session_id for r in _rows(sqlite_db)]
    assert ids == [ssd._key("sid-legacy")]


def test_delete_tras_save_no_revive_la_sesion(sqlite_db):
    for _ in range(20):
        state.save_session("sid-x", {"access_token": "t", "expires_in": 3600})
        state.delete_session("sid-x")
    ssd.flush()
    assert _rows(sqlite_db) == []
    assert state.get_session("sid-x") is None


def test_dato_con_otra_llave_equivale_a_sin_sesion(sqlite_db, monkeypatch):
    ssd.upsert_async("sid-k", _entry(), 3600)
    ssd.flush()
    from cryptography.fernet import Fernet
    monkeypatch.setattr(ssd, "_FERNET", Fernet(Fernet.generate_key()))
    assert ssd.fetch("sid-k") is None


def test_get_session_aplica_techo_absoluto(sqlite_db):
    state.save_session("sid-old", {"access_token": "t", "expires_in": 3600})
    state.SESSION_STORE["sid-old"]["iat"] = time.time() - state.SESSION_TTL - 10
    assert state.get_session("sid-old") is None
