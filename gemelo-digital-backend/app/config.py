"""Configuración centralizada del backend (variables de entorno).

- Carga `.env` UNA sola vez (misma lógica que tenía app/db/session.py:
  primero `<backend>/.env`, si no existe el default de python-dotenv;
  `override=False`, así que en producción mandan las env vars del taskdef).
- Lee os.environ una única vez al importar y expone `settings`.

Los valores se guardan "crudos" (lo mismo que devolvía `os.getenv(NAME,
default)`); cada módulo aplica la misma normalización que aplicaba antes
(rstrip("/"), strip(), int(), ...) y conserva sus constantes de módulo
(p.ej. `deps.CLIENT_ID`, `lti.TOOL_BASE_URL`) para que los imports y los
monkeypatch de los tests sigan funcionando.

Los secretos de firma (LTI_STATE_SECRET / SESSION_SECRET) se validan en
app/security.py, que sigue lanzando error en producción si faltan.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_PATH = _BACKEND_ROOT / ".env"

# Estas variables se leían, al arrancar `main:app`, ANTES de que se cargara
# el .env (sus módulos — app.state, app.rate_limit, brightspace_client — se
# importaban antes que app.db.session, que era quien llamaba load_dotenv).
# Para no cambiar ese comportamiento se capturan antes de cargar el .env:
# en producción (env del taskdef) da igual; en dev, un valor puesto SOLO en
# .env para estas variables se sigue ignorando, igual que antes.
_PRE_DOTENV_KEYS = (
    "GEMELO_PERSIST_SESSIONS",
    "GEMELO_SESSION_FILE",
    "TRUSTED_PROXY_HOPS",
    "RATE_LIMIT_ENABLED",
    "BRIGHTSPACE_TIMEOUT_SECONDS",
    "BRIGHTSPACE_MAX_RETRIES",
)
_PRE_DOTENV = {k: os.environ[k] for k in _PRE_DOTENV_KEYS if k in os.environ}


def _load_env_file() -> None:
    # En producción (ECS) las env vars vienen del taskdef, no de .env — en
    # ese caso load_dotenv no encuentra archivo y eso está bien.
    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH, override=False)
    else:
        load_dotenv(override=False)


_load_env_file()


def _env(name: str, default=None):
    """Igual que os.getenv(name, default)."""
    return os.environ.get(name, default)


def _pre(name: str, default=None):
    """Valor tal como estaba ANTES de cargar el .env (ver _PRE_DOTENV_KEYS)."""
    return _PRE_DOTENV.get(name, default)


_DEFAULT_SCOPE = (
    "core:*:* Application:*:* Data:*:* enrollment:own_enrollment:read enrollment:orgunit:read "
    "users:own_profile:read users:profile:read grades:gradeobjects:read grades:gradevalues:read "
    "grades:own_grades:read grades:gradeschemes:read grades:gradesettings:read "
    "grades:gradestatistics:read grades:gradecategories:read outcomes:sets:read "
    "outcomes:sets:export outcomes:sets:import outcomes:sets:manage outcomes:alignments:read "
    "outcomes:alignments:manage content:modules:readonly content:topics:readonly content:toc:read "
    "content:completions:read rubrics:objects:read rubrics:assessments:read dropbox:folders:read "
    "discussions:forums:readonly discussions:topics:readonly quizzing:quizzes:read "
    "quizzing:attempts:read organizations:organization:read orgunits:course:read role:detail:read"
)


@dataclass
class Settings:
    # ── Brightspace (OAuth + API) ────────────────────────────────────────
    brightspace_base_url: str
    brightspace_lp_version: str
    brightspace_le_version: str
    brightspace_grade_version: str
    brightspace_lo_version: str
    brightspace_align_version: str
    brightspace_quiz_version: str
    brightspace_auth_url: str
    brightspace_token_url: str
    brightspace_client_id: str
    brightspace_client_secret: str
    brightspace_redirect_uri: str
    brightspace_scope: str
    brightspace_service_refresh_token: str
    brightspace_timeout_seconds: str
    brightspace_max_retries: str

    # ── App / despliegue ─────────────────────────────────────────────────
    tool_base_url: str
    frontend_base_url: Optional[str]  # None = no definida (lti cae a TOOL_BASE_URL)
    superadmin_ids: str
    bug_report_email: str
    gemelo_data_dir: Optional[str]
    gemelo_users_file: Optional[str]
    gemelo_persist_sessions: Optional[str]
    gemelo_session_file: Optional[str]
    course_config_dir: Optional[str]
    debug_endpoints_enabled: str
    cron_shared_secret: str
    rate_limit_enabled: str
    trusted_proxy_hops: str
    database_url: Optional[str]

    # ── Secretos / LTI ───────────────────────────────────────────────────
    lti_state_secret: Optional[str]
    session_secret: Optional[str]
    session_enc_key: Optional[str]
    lti_issuer: str
    lti_auth_endpoint: str
    lti_jwks_url: str
    lti_client_id: str
    lti_deployment_id: str
    lti_kid: str
    lti_private_key_path: str
    lti_private_key_pem: Optional[str]

    # ── SMTP ─────────────────────────────────────────────────────────────
    smtp_host: str
    smtp_user: str
    smtp_password: str
    smtp_port: str
    smtp_from: str
    smtp_from_name: str
    smtp_use_ssl: str
    smtp_timeout: str

    # ── ElevenLabs / Sentry ──────────────────────────────────────────────
    elevenlabs_api_key: str
    elevenlabs_voice_id: str
    elevenlabs_model: str
    sentry_dsn: str
    sentry_environment: str
    sentry_release: Optional[str]
    sentry_traces_sample_rate: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            brightspace_base_url=_env("BRIGHTSPACE_BASE_URL", ""),
            # Versiones de la API (cesa.brightspace.com soporta LE 1.99 / LP 1.63 a
            # 2026-10). LP 1.50 (contrato 20.25) queda deprecado en 20.27.1.
            # Los cambios hasta estas versiones son aditivos para las rutas que
            # usamos; 1.98+ habilita grades/schemes/default y la escala de logro
            # (ScaleId) en los conjuntos de RA.
            brightspace_lp_version=_env("BRIGHTSPACE_LP_VERSION", "1.63"),
            brightspace_le_version=_env("BRIGHTSPACE_LE_VERSION", "1.99"),
            brightspace_grade_version=_env("BRIGHTSPACE_GRADE_VERSION", "1.99"),
            brightspace_lo_version=_env("BRIGHTSPACE_LO_VERSION", "1.99"),
            brightspace_align_version=_env("BRIGHTSPACE_ALIGN_VERSION", "1.99"),
            brightspace_quiz_version=_env("BRIGHTSPACE_QUIZ_VERSION", "1.99"),
            brightspace_auth_url=_env("BRIGHTSPACE_AUTH_URL", "https://auth.brightspace.com/oauth2/auth"),
            brightspace_token_url=_env("BRIGHTSPACE_TOKEN_URL", "https://auth.brightspace.com/core/connect/token"),
            brightspace_client_id=_env("BRIGHTSPACE_CLIENT_ID", ""),
            brightspace_client_secret=_env("BRIGHTSPACE_CLIENT_SECRET", ""),
            brightspace_redirect_uri=_env("BRIGHTSPACE_REDIRECT_URI", ""),
            brightspace_scope=_env("BRIGHTSPACE_SCOPE", _DEFAULT_SCOPE),
            brightspace_service_refresh_token=_env("BRIGHTSPACE_SERVICE_REFRESH_TOKEN", ""),
            brightspace_timeout_seconds=_pre("BRIGHTSPACE_TIMEOUT_SECONDS", "30"),
            brightspace_max_retries=_pre("BRIGHTSPACE_MAX_RETRIES", "3"),
            tool_base_url=_env("TOOL_BASE_URL", ""),
            frontend_base_url=_env("FRONTEND_BASE_URL"),
            superadmin_ids=_env("SUPERADMIN_IDS", "5427"),
            bug_report_email=_env("BUG_REPORT_EMAIL", "desarrolloprofesoral@cesa.edu.co"),
            gemelo_data_dir=_env("GEMELO_DATA_DIR"),
            gemelo_users_file=_env("GEMELO_USERS_FILE"),
            gemelo_persist_sessions=_pre("GEMELO_PERSIST_SESSIONS"),
            gemelo_session_file=_pre("GEMELO_SESSION_FILE"),
            course_config_dir=_env("COURSE_CONFIG_DIR"),
            debug_endpoints_enabled=_env("DEBUG_ENDPOINTS_ENABLED", ""),
            cron_shared_secret=_env("CRON_SHARED_SECRET", ""),
            rate_limit_enabled=_pre("RATE_LIMIT_ENABLED", "1"),
            trusted_proxy_hops=_pre("TRUSTED_PROXY_HOPS", "1"),
            database_url=_env("DATABASE_URL"),
            lti_state_secret=_env("LTI_STATE_SECRET"),
            session_secret=_env("SESSION_SECRET"),
            session_enc_key=_env("SESSION_ENC_KEY"),
            lti_issuer=_env("LTI_ISSUER", "https://cesa.brightspace.com"),
            lti_auth_endpoint=_env("LTI_AUTH_ENDPOINT", "https://cesa.brightspace.com/d2l/lti/authenticate"),
            lti_jwks_url=_env("LTI_JWKS_URL", "https://cesa.brightspace.com/d2l/.well-known/jwks"),
            lti_client_id=_env("LTI_CLIENT_ID", ""),
            lti_deployment_id=_env("LTI_DEPLOYMENT_ID", ""),
            lti_kid=_env("LTI_KID", "gemelo-kid-1"),
            lti_private_key_path=_env("LTI_PRIVATE_KEY_PATH", "/app/keys/lti_private.pem"),
            lti_private_key_pem=_env("LTI_PRIVATE_KEY_PEM"),
            smtp_host=_env("SMTP_HOST", "smtp.office365.com"),
            smtp_user=_env("SMTP_USER", ""),
            smtp_password=_env("SMTP_PASSWORD", ""),
            smtp_port=_env("SMTP_PORT", "587"),
            smtp_from=_env("SMTP_FROM", ""),
            smtp_from_name=_env("SMTP_FROM_NAME", "G.D CESA"),
            smtp_use_ssl=_env("SMTP_USE_SSL", ""),
            smtp_timeout=_env("SMTP_TIMEOUT", "20"),
            elevenlabs_api_key=_env("ELEVENLABS_API_KEY", ""),
            elevenlabs_voice_id=_env("ELEVENLABS_VOICE_ID", "pFZP5JQG7iQjIQuC4Bku"),
            elevenlabs_model=_env("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
            sentry_dsn=_env("SENTRY_DSN", ""),
            sentry_environment=_env("SENTRY_ENVIRONMENT", "production"),
            sentry_release=_env("SENTRY_RELEASE"),
            sentry_traces_sample_rate=_env("SENTRY_TRACES_SAMPLE_RATE", "0.1"),
        )

    @property
    def is_production(self) -> bool:
        """TOOL_BASE_URL en https:// es el indicador de despliegue productivo."""
        return (self.tool_base_url or "").lower().startswith("https://")


settings = Settings.from_env()
