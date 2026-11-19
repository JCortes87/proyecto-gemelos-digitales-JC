# app/services/email_service.py
"""
Servicio de envío de correo (SMTP) reutilizable.

Se usa para:
  1. Reportes de error (bug reports) → llegan al administrador.
  2. Anuncios/notificaciones del administrador hacia los usuarios.

Configuración por variables de entorno (nada hardcodeado):
  SMTP_HOST        host del servidor SMTP (ej: smtp.office365.com)
  SMTP_PORT        puerto (587 STARTTLS por defecto, 465 SSL)
  SMTP_USER        usuario/login SMTP
  SMTP_PASSWORD    contraseña / app-password
  SMTP_FROM        dirección "From" (por defecto = SMTP_USER)
  SMTP_FROM_NAME   nombre visible del remitente (por defecto "G.D CESA")
  SMTP_USE_SSL     "1" para SSL directo (puerto 465). Por defecto STARTTLS.
  SMTP_TIMEOUT     timeout en segundos (por defecto 20)

Si no hay configuración SMTP, `smtp_configured()` devuelve False y los
llamadores pueden degradar con gracia (ej: el frontend cae a un mailto).
"""
import ssl
import smtplib
import logging
from email.message import EmailMessage
from email.utils import formataddr
from typing import List, Optional, Dict, Any

from app.config import settings

logger = logging.getLogger("uvicorn.error")


def _cfg() -> Dict[str, Any]:
    # Default Office365 (smtp.office365.com:587 STARTTLS). Se puede sobreescribir
    # con SMTP_HOST/SMTP_PORT para otro proveedor.
    host = settings.smtp_host.strip()
    user = settings.smtp_user.strip()
    password = settings.smtp_password
    port = int(settings.smtp_port or "587")
    from_addr = settings.smtp_from.strip() or user
    from_name = settings.smtp_from_name.strip()
    use_ssl = settings.smtp_use_ssl.strip() == "1"
    timeout = int(settings.smtp_timeout or "20")
    return {
        "host": host, "port": port, "user": user, "password": password,
        "from_addr": from_addr, "from_name": from_name,
        "use_ssl": use_ssl, "timeout": timeout,
    }


def smtp_configured() -> bool:
    """True si hay host + credenciales + remitente configurados."""
    c = _cfg()
    return bool(c["host"] and c["user"] and c["password"] and c["from_addr"])


def send_email(
    to: List[str],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    reply_to: Optional[str] = None,
    bcc: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Envía un correo. Devuelve {"ok": bool, "error": str|None, "recipients": int}.

    - `to`: lista de destinatarios visibles (para anuncios masivos preferir
      dejar `to` = [remitente] y usar `bcc` para no exponer las direcciones).
    - `bcc`: destinatarios ocultos (broadcast).
    - No lanza excepción: cualquier fallo se devuelve en "error".
    """
    to = [t.strip() for t in (to or []) if t and t.strip()]
    bcc = [b.strip() for b in (bcc or []) if b and b.strip()]

    if not to and not bcc:
        return {"ok": False, "error": "sin_destinatarios", "recipients": 0}

    if not smtp_configured():
        return {"ok": False, "error": "smtp_no_configurado", "recipients": 0}

    c = _cfg()
    msg = EmailMessage()
    msg["From"] = formataddr((c["from_name"], c["from_addr"]))
    msg["To"] = ", ".join(to) if to else formataddr((c["from_name"], c["from_addr"]))
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body_text or "")
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    all_rcpts = list(dict.fromkeys(to + bcc))  # dedup preservando orden

    try:
        if c["use_ssl"]:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(c["host"], c["port"], timeout=c["timeout"], context=ctx) as srv:
                srv.login(c["user"], c["password"])
                srv.send_message(msg, from_addr=c["from_addr"], to_addrs=all_rcpts)
        else:
            with smtplib.SMTP(c["host"], c["port"], timeout=c["timeout"]) as srv:
                srv.ehlo()
                srv.starttls(context=ssl.create_default_context())
                srv.ehlo()
                srv.login(c["user"], c["password"])
                srv.send_message(msg, from_addr=c["from_addr"], to_addrs=all_rcpts)
        return {"ok": True, "error": None, "recipients": len(all_rcpts)}
    except Exception as e:
        logger.warning("send_email fallo: %s", str(e)[:200])
        return {"ok": False, "error": str(e)[:200], "recipients": 0}
