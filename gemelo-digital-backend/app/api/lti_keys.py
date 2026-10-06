import base64
import logging
import os

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

from app.config import settings

logger = logging.getLogger("uvicorn.error")

KEY_ID = settings.lti_kid

def _b64url_uint(n: int) -> str:
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

# Fuente de la llave privada, en orden:
#   1) LTI_PRIVATE_KEY_PEM (recomendado en producción: Secrets Manager → env),
#      así el JWKS es estable entre deploys y entre tareas ECS.
#   2) Archivo en LTI_PRIVATE_KEY_PATH (persistencia simple en dev).
#   3) Se genera una nueva (efímera si no se puede escribir el archivo).
KEY_PATH = settings.lti_private_key_path

_private_key = None

def load_or_create_key():
    global _private_key
    if _private_key:
        return _private_key

    pem_env = (settings.lti_private_key_pem or "").strip()
    if pem_env:
        # Permite guardar el PEM en una sola línea con "\n" literales.
        _private_key = serialization.load_pem_private_key(
            pem_env.replace("\\n", "\n").encode("utf-8"), password=None
        )
        return _private_key

    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "rb") as f:
            _private_key = serialization.load_pem_private_key(f.read(), password=None)
        return _private_key

    # crear nueva
    _private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    logger.warning(
        "LTI: no hay LTI_PRIVATE_KEY_PEM ni llave en %s; se generó una nueva "
        "(el JWKS cambiará en cada despliegue)", KEY_PATH,
    )
    pem = _private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    try:
        os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
        with open(KEY_PATH, "wb") as f:
            f.write(pem)
    except OSError as e:
        logger.warning("LTI: no se pudo persistir la llave en %s: %s", KEY_PATH, e)

    return _private_key

def get_jwks():
    key = load_or_create_key()
    pub = key.public_key().public_numbers()

    jwk = {
        "kty": "RSA",
        "kid": KEY_ID,
        "use": "sig",
        "alg": "RS256",
        "n": _b64url_uint(pub.n),
        "e": _b64url_uint(pub.e),
    }
    return {"keys": [jwk]}
