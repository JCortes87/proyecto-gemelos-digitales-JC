from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

#|---- Aquí para preparar SessionLocal para uso transaccional--------|

# El .env se carga UNA vez en app/config.py (primero desde la raiz del
# backend, independiente del cwd; si no existe, fallback al default de
# python-dotenv). En produccion (ECS) las env vars vienen del taskdef.
from app.config import settings, _ENV_PATH as _env_path

DATABASE_URL = settings.database_url

if not DATABASE_URL:
    raise RuntimeError(
        f"Falta DATABASE_URL en variables de entorno. "
        f"Intentamos cargar .env desde: {_env_path} "
        f"(existe: {_env_path.exists()}). "
        f"Verifica que el archivo exista y contenga DATABASE_URL=postgresql+psycopg://...; "
        f"o, en produccion, que la variable este en el taskdef."
    )

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    # connect_timeout corto: si la BD no es alcanzable (p. ej. RDS sin acceso
    # desde la red local en dev), fallar en ~5s en vez de colgar el startup
    # varios minutos con el timeout TCP del SO. En produccion (misma VPC que
    # RDS) la conexion tarda milisegundos, asi que no afecta.
    connect_args={"connect_timeout": 5},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)