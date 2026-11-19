"""Parsers puros de outcomeSets / alignments de Brightspace (índices RA)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# =========================================================
# Auto-mapeo de Resultados de Aprendizaje (RA) desde outcomeSets
# =========================================================
# Muchos cursos (+10k) no tienen config manual en config/courses/{id}.json.
# Para ellos derivamos los RAs en runtime a partir de:
#   - /lo/outcomeSets/  → descripciones en formato "CODIGO-Texto"
#   - CriteriaOutcome de la evaluación de rúbrica → OutcomeId por criterio
# El endpoint /lo/alignments/ da 404 en esta versión, por eso el vínculo
# criterio→outcome se toma del propio payload de la evaluación.

# Formato observado: "Z1O1DOR3-Emplear los conceptos...". Guión ASCII/medio/
# largo o dos puntos, con espacios opcionales alrededor.
_OUTCOME_CODE_REGEX = re.compile(r"^([A-Za-z0-9._-]+)\s*[-–—:]\s*(.+)$")

def _parse_outcome_desc(desc: str) -> Optional[Dict[str, str]]:
    """Devuelve {code,title,description} si el texto encaja "CODIGO-Texto"."""
    if not desc:
        return None
    m = _OUTCOME_CODE_REGEX.match(desc.strip())
    if not m:
        return None
    return {
        "code": m.group(1).upper(),
        "title": m.group(2).strip(),
        "description": desc.strip(),
    }


def _clean_text(s: str) -> str:
    """Quita caracteres invisibles que Brightspace inserta alrededor del texto
    (zero-width space, BOM) y normaliza nbsp a espacio. Sin esto el código RA
    queda precedido por un \\u200b y el regex '^CODIGO' no matchea."""
    if not s:
        return ""
    for ch in ("\u200b", "\u200c", "\u200d", "\ufeff"):
        s = s.replace(ch, "")
    s = s.replace("\xa0", " ")
    return s.strip()


def _richtext_to_str(v: Any) -> str:
    """Brightspace suele devolver textos como RichText {Text, Html}. Extrae
    el texto plano tanto si viene como string como si viene como ese objeto."""
    if v is None:
        return ""
    if isinstance(v, dict):
        v = (
            v.get("Text") or v.get("text")
            or v.get("Html") or v.get("html") or ""
        )
    return _clean_text(str(v))


def _walk_outcome_nodes(node: Any, out: Dict[str, Dict[str, str]]) -> None:
    """Recorre recursivamente el árbol de outcomeSets acumulando
    { outcomeId(uuid) : {code,title,description} }.

    El código del RA (p.ej. 'Z1O1DOR3') puede venir en un campo aparte
    (Notation/AltNotation) o embebido en la descripción como 'CODIGO-Texto'.
    La descripción puede ser string o RichText {Text,Html}."""
    if node is None:
        return
    if isinstance(node, list):
        for it in node:
            _walk_outcome_nodes(it, out)
        return
    if not isinstance(node, dict):
        return
    oid = (
        node.get("SourceId")
        or node.get("OutcomeId")
        or node.get("Id")
        or node.get("id")
    )
    notation = (
        node.get("ShortCode") or node.get("shortCode")
        or node.get("Notation") or node.get("notation")
        or node.get("AltNotation") or node.get("altNotation")
    )
    if notation:
        notation = _clean_text(str(notation))
    desc = _richtext_to_str(
        node.get("Description") or node.get("description")
        or node.get("Name") or node.get("name")
    ).strip()

    parsed = None
    if notation:
        code = str(notation).strip().upper()
        title = desc
        m = _OUTCOME_CODE_REGEX.match(desc)
        if m and m.group(1).upper() == code:
            title = m.group(2).strip()
        parsed = {
            "code": code,
            "title": title or desc or code,
            "description": desc or code,
        }
    elif desc:
        parsed = _parse_outcome_desc(desc)

    if oid and parsed:
        out.setdefault(str(oid), parsed)
    for k in (
        "Outcomes", "outcomes",
        "SubOutcomes", "subOutcomes",
        "ChildOutcomes", "childOutcomes",
        "Children", "children",
    ):
        if k in node:
            _walk_outcome_nodes(node[k], out)


def _first_leaf_outcome(node: Any):
    """Devuelve el primer nodo hijo de outcome (para diagnóstico)."""
    if isinstance(node, list):
        for it in node:
            r = _first_leaf_outcome(it)
            if r is not None:
                return r
        return None
    if not isinstance(node, dict):
        return None
    for k in ("Outcomes", "outcomes", "SubOutcomes", "subOutcomes",
              "ChildOutcomes", "childOutcomes", "Children", "children"):
        children = node.get(k)
        if children:
            r = _first_leaf_outcome(children)
            if r is not None:
                return r
    # nodo sin hijos → es una hoja (outcome)
    if node.get("Id") or node.get("OutcomeId") or node.get("SourceId"):
        return node
    return None


def _index_outcome_sets(payload: Any) -> Dict[str, Dict[str, str]]:
    """Devuelve { outcomeUuid : {code,title,description} }."""
    out: Dict[str, Dict[str, str]] = {}
    if not payload:
        return out
    items = payload
    if isinstance(payload, dict):
        items = payload.get("outcomeSets") or payload.get("OutcomeSets") or payload
    _walk_outcome_nodes(items, out)
    return out


def _outcome_id_from_co(co: Dict[str, Any]) -> Optional[str]:
    """Extrae el OutcomeId (uuid) de un CriteriaOutcome, probando las
    variantes de nombre que devuelve Brightspace. None si no lo trae."""
    if not isinstance(co, dict):
        return None
    for k in ("OutcomeId", "outcomeId", "SourceId", "sourceId"):
        v = co.get(k)
        if v:
            return str(v)
    outs = co.get("Outcomes") or co.get("outcomes")
    if isinstance(outs, list) and outs and isinstance(outs[0], dict):
        first = outs[0]
        for k in ("OutcomeId", "SourceId", "Id", "id"):
            v = first.get(k)
            if v:
                return str(v)
    return None


def _index_alignments(payload: Any) -> Dict[str, List[str]]:
    """Construye { str(rubricId) : [outcomeId, ...] } desde el endpoint
    bulk /lo/alignments/.

    Estructura real (verificada en cesa.brightspace.com, v1.93):
        [ { "OutcomeSetId": 95,
            "OutcomeId": "<guid>",
            "Activities": [ { "ActivityType": "Assignment",
                              "ObjectId": <folderId>,
                              "RubricId": <rubricId> },
                            { "ActivityType": "Quiz",
                              "ObjectId": <quizId>,
                              "QuestionId": <qId> }, ... ] }, ... ]

    Es decir: el OutcomeId está arriba y las actividades alineadas cuelgan
    de él. La alineación es a nivel de RÚBRICA (RubricId), no de criterio —
    el API de esta versión no expone el vínculo criterio→outcome. Una misma
    rúbrica puede alinearse a varios outcomes, por eso el valor es lista.
    """
    out: Dict[str, List[str]] = {}
    if not isinstance(payload, list):
        return out
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        oid = entry.get("OutcomeId") or entry.get("outcomeId")
        if not oid:
            continue
        oid = str(oid)
        for act in (entry.get("Activities") or []):
            if not isinstance(act, dict):
                continue
            rid = act.get("RubricId") or act.get("rubricId")
            if rid in (None, ""):
                continue
            bucket = out.setdefault(str(int(rid)), [])
            if oid not in bucket:
                bucket.append(oid)
    return out


def _index_quiz_alignments(payload: Any) -> Dict[str, List[str]]:
    """Construye { str(quizId) : [outcomeId, ...] } desde el bulk
    /lo/alignments/, tomando las actividades ActivityType == "Quiz".

    A diferencia de las rúbricas, aquí la alineación es a nivel de PREGUNTA
    (cada Activity trae QuestionId), pero el API no expone la nota por
    pregunta, así que colapsamos a nivel de QUIZ: un quiz se considera
    alineado a todos los outcomes de sus preguntas. El % del quiz (via grade
    item) se atribuye a cada uno de esos outcomes (aproximación aceptada:
    misma granularidad que las rúbricas).
    """
    out: Dict[str, List[str]] = {}
    if not isinstance(payload, list):
        return out
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        oid = entry.get("OutcomeId") or entry.get("outcomeId")
        if not oid:
            continue
        oid = str(oid)
        for act in (entry.get("Activities") or []):
            if not isinstance(act, dict):
                continue
            if (act.get("ActivityType") or "").lower() != "quiz":
                continue
            qz = act.get("ObjectId") or act.get("objectId")
            if qz in (None, ""):
                continue
            bucket = out.setdefault(str(int(qz)), [])
            if oid not in bucket:
                bucket.append(oid)
    return out
