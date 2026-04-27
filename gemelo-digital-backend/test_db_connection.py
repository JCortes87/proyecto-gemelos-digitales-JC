import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

database_url = os.getenv("DATABASE_URL")
print("DATABASE_URL =", database_url)

if not database_url:
    raise RuntimeError("No existe DATABASE_URL en el .env")

engine = create_engine(database_url, pool_pre_ping=True)

with engine.connect() as conn:
    result = conn.execute(text("SELECT current_user, current_database(), version()")).fetchone()
    print("Conexion OK")
    print("Usuario:", result[0])
    print("Base:", result[1])
    print("Version:", result[2])