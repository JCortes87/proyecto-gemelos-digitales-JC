"""
Herramienta de desarrollo: crea todas las tablas desde cero.
NO usar en producción. En producción usar: alembic upgrade head
"""
from app.db.base import Base
from app.db import models  # noqa: F401 — registra todos los modelos
from app.db.session import engine


def init_db() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL no configurado")
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas exitosamente.")


def drop_all() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL no configurado")
    Base.metadata.drop_all(bind=engine)
    print("Tablas eliminadas.")


if __name__ == "__main__":
    init_db()
