"""
Helpers de roles, identificacion de usuarios y normalizacion de
classlist.

Brightspace devuelve roles con varios nombres dependiendo del
endpoint (ClasslistRoleDisplayName, RoleName, ClasslistRoleName, Role.Name)
y los IDs de usuario tambien varian (Identifier, UserId, Id). Estas
funciones encapsulan los lookups defensivos para que el resto del
codigo no tenga que pelear con esa heterogeneidad.

Tambien resuelve el "access level" del usuario actual (admin /
teacher / student) que decide que vista del dashboard ver.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.text_utils import _norm


#|---------- Normalizacion de la respuesta de classlist ----------|
def _as_items_list(classlist_resp: Any) -> List[Dict[str, Any]]:
    """
    Normaliza la respuesta de classlist a una lista de dicts.

    Brightspace puede devolver:
    - Una lista directa de items.
    - Un dict con clave 'items' o 'Items' que envuelve la lista.
    - None en error.
    """
    if classlist_resp is None:
        return []
    if isinstance(classlist_resp, list):
        return [x for x in classlist_resp if isinstance(x, dict)]
    if isinstance(classlist_resp, dict):
        items = classlist_resp.get("items") or classlist_resp.get("Items") or []
        return [x for x in items if isinstance(x, dict)]
    return []


#|---------- Predicados de rol ----------|
def _is_student_role(role_name: str) -> bool:
    """
    True si el role_name (string libre desde Brightspace) representa
    un estudiante. Tolerante a variantes ES/EN: 'estudiante',
    'student', 'learner'.
    """
    r = _norm(role_name)
    return ("estudiante" in r) or ("student" in r) or ("learner" in r)


#|---------- Extraccion de campos de un row de classlist ----------|
def _extract_role_name(row: Dict[str, Any]) -> str:
    """
    Saca el role_name de un row de classlist, probando los varios
    nombres de campo que Brightspace usa segun el endpoint:

    1. ClasslistRoleDisplayName
    2. RoleName
    3. ClasslistRoleName
    4. Role.Name (Role como dict embebido)

    Si nada matchea, retorna "".
    """
    if not isinstance(row, dict):
        return ""
    for k in ("ClasslistRoleDisplayName", "RoleName", "ClasslistRoleName"):
        v = row.get(k)
        if v:
            return str(v)
    role_obj = row.get("Role")
    if isinstance(role_obj, dict) and role_obj.get("Name"):
        return str(role_obj.get("Name"))
    return ""


def _extract_user_id(row: Any) -> Optional[int]:
    """
    Saca el user_id (entero) de un row de classlist o de un response
    individual de usuario. Brightspace usa varios nombres:
    'Identifier', 'UserId', 'Id'.
    """
    if not isinstance(row, dict):
        return None
    for k in ("Identifier", "UserId", "Id"):
        v = row.get(k)
        if v is None:
            continue
        try:
            return int(v)
        except Exception:
            continue
    return None


def _display_name(row: Dict[str, Any]) -> str:
    """
    Construye el nombre a mostrar para un row de classlist,
    cayendo en cascada por preferencia:

    1. DisplayName (lo mas completo, ya pre-formado).
    2. FirstName + LastName (si hay alguno).
    3. OrgDefinedId (codigo institucional).
    4. user_id como string (ultimo recurso).
    """
    dn = row.get("DisplayName")
    if dn:
        return str(dn)
    fn = row.get("FirstName")
    ln = row.get("LastName")
    if fn or ln:
        return f"{fn or ''} {ln or ''}".strip()
    odi = row.get("OrgDefinedId")
    if odi:
        return str(odi)
    uid = _extract_user_id(row)
    return str(uid) if uid is not None else ""


#|---------- Resolucion de access level (admin / teacher / student) ----------|
def resolve_access_level(
    classlist_role_name: str,
    lis_roles: Optional[List[str]] = None,
) -> str:
    """
    Decide el access level del usuario combinando:

    - classlist_role_name: el rol del classlist de Brightspace
      (ej. 'Instructor', 'Student').
    - lis_roles: la lista de LIS roles si vino de un launch LTI
      (ej. ['urn:lti:role:ims/lis/Instructor']).

    Prioridades:
    1. Cualquier mencion de 'administrator' -> 'admin'.
    2. 'instructor' o 'faculty' -> 'teacher'.
    3. 'estudiante', 'student', 'learner' -> 'student'.
    4. Fallback conservador: 'student'.

    El fallback 'student' es deliberado: en duda, es mejor dar la
    vista mas restringida (de estudiante) que filtrar lista de
    companeros a alguien que no debia verla.
    """
    r = _norm(classlist_role_name)
    lis = [_norm(x) for x in (lis_roles or [])]

    is_admin = ("super administrator" in r) or ("administrator" in r) or any("administrator" in x for x in lis)
    if is_admin:
        return "admin"

    is_teacher = ("instructor" in r) or ("faculty" in r) or any(
        ("instructor" in x) or ("faculty" in x) for x in lis
    )
    if is_teacher:
        return "teacher"

    is_student = (
        ("estudiante" in r) or ("student" in r) or ("learner" in r)
        or any(("learner" in x) or ("student" in x) for x in lis)
    )
    if is_student:
        return "student"

    return "student"


#|---------- Vista a renderizar segun el enrollment del usuario ----------|
def normalize_view_from_enrollment(enrollment: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recibe el response de `get_my_enrollment(orgUnitId)` de Brightspace
    y devuelve un dict resumen para que el resto del codigo decida
    que vista renderizar:

    {
        accessLevel:        'admin' | 'teacher' | 'student',
        view:               'teacher' | 'student',
        classlistRoleName:  ... (raw),
        lisRoles:           [...] (raw),
        isAdmin:            bool,
        isInstructor:       bool,
        isStudent:          bool,
    }

    'view' es un colapso conveniente: admin y teacher comparten
    layout (vista docente con clase completa); student tiene su
    propia vista.
    """
    access = enrollment.get("Access") or {}
    classlist_role = access.get("ClasslistRoleName")
    lis_roles = access.get("LISRoles") or []

    access_level = resolve_access_level(
        str(classlist_role or ""), [str(x) for x in lis_roles]
    )
    view = "teacher" if access_level in ("admin", "teacher") else "student"

    return {
        "accessLevel": access_level,
        "view": view,
        "classlistRoleName": classlist_role,
        "lisRoles": lis_roles,
        "isAdmin": access_level == "admin",
        "isInstructor": access_level == "teacher",
        "isStudent": access_level == "student",
    }
