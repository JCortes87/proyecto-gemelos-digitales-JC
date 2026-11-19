"""user_registry: la lista de usuarios (destinatarios de anuncios) debe
salir de Postgres y no solo del JSON local, que se pierde en cada redeploy."""
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import KnownUser
from app.services import user_registry as ur


@pytest.fixture
def registry(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    KnownUser.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    import app.db.session as db_session
    monkeypatch.setattr(db_session, "SessionLocal", Session)
    monkeypatch.setattr(ur, "_REGISTRY_PATH", str(tmp_path / "known_users.json"))
    return Session


def _add(Session, uid, email, audience=None):
    with Session() as db:
        db.add(KnownUser(user_id=uid, email=email, audience=audience,
                         first_seen=datetime.utcnow(), last_seen=datetime.utcnow(),
                         login_count=1))
        db.commit()


def test_usuarios_de_postgres_aunque_el_json_este_vacio(registry):
    _add(registry, "1", "docente@cesa.edu.co", "staff")
    _add(registry, "2", "alumno@cesa.edu.co", "student")
    assert {u["user_id"] for u in ur.list_users()} == {"1", "2"}
    assert ur.list_emails(exclude_students=True) == ["docente@cesa.edu.co"]


def test_combina_json_y_postgres_sin_duplicar(registry):
    ur.record_user("3", "Solo JSON", "json@cesa.edu.co")
    _add(registry, "3", "json@cesa.edu.co", "staff")
    _add(registry, "4", "db@cesa.edu.co")
    emails = ur.list_emails()
    assert sorted(emails) == ["db@cesa.edu.co", "json@cesa.edu.co"]


def test_si_la_bd_falla_usa_el_json(registry, monkeypatch):
    ur.record_user("5", "Respaldo", "respaldo@cesa.edu.co")
    monkeypatch.setattr(ur, "_load_db", lambda: None)
    assert ur.list_emails() == ["respaldo@cesa.edu.co"]
