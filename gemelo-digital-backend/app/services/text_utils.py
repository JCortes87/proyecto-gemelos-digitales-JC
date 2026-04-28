"""
Helpers de procesamiento de texto y comentarios.

Este modulo agrupa funciones puras (sin estado) que limpian o
inspeccionan strings provenientes de Brightspace: HTML de comentarios
de docentes, etiquetas de roles, frases sueltas que indican que un
estudiante no entrego una evidencia, etc.

Pertenecen aqui porque son texto-centric y no dependen de la logica
de negocio (gradebook, escalas, riesgo).
"""
from __future__ import annotations

import re
from typing import Any


#|---------- Limpieza de HTML / normalizacion de texto ----------|
def _strip_html(text: Any) -> str:
    """
    Quita tags HTML, colapsa whitespace y devuelve texto plano.

    Brightspace devuelve comentarios de docente con HTML embebido
    (`<p>`, `<br>`, etc). Esto es util para hacer matching de patrones
    sin que las tags interfieran.
    """
    s = str(text or "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm(x: Any) -> str:
    """
    Normalizador suave: convierte a str, hace strip y baja a lowercase.

    Util para comparaciones tolerantes (ej: chequear si un role_name
    contiene 'student' sin preocuparse por mayusculas/espacios).
    """
    return str(x or "").strip().lower()


#|---------- Deteccion de "no entrego" en comentarios y feedback ----------|
def _looks_like_not_submitted(comment_html: Any) -> bool:
    """
    Heuristica sobre comentarios HTML de docente: True si el texto
    tiene frases que sugieren que el estudiante NO entrego la evidencia.

    Cubre variantes ES (con y sin tildes) y EN. Se usa para penalizar
    cobertura cuando el docente comento sin asignar nota (en vez de
    contar el item como "pendiente normal").
    """
    txt = _strip_html(comment_html).lower()
    if not txt:
        return False

    patterns = [
        "no entrego",
        "no entregó",
        "sin entrega",
        "no presentó",
        "no presento",
        "not submitted",
        "missing submission",
        "did not submit",
        "no submission",
    ]
    return any(p in txt for p in patterns)


def _text_has_no_submission_signal(text: Any) -> bool:
    """
    Variante de `_looks_like_not_submitted` para texto plano (sin
    pasar por _strip_html). Util cuando el texto ya viene limpio de
    otra capa.

    Tiene un set ligeramente distinto de patrones (sin "missing
    submission", sin "no submission") porque aplica a feedback corto
    en vez de a comentarios HTML largos.
    """
    s = str(text or "").strip().lower()
    if not s:
        return False

    patterns = [
        "no entrego",
        "no entregó",
        "no presento",
        "no presentó",
        "sin entrega",
        "no submission",
        "not submitted",
        "did not submit",
    ]
    return any(p in s for p in patterns)
