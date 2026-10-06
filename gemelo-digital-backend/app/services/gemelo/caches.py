"""Cachés en memoria compartidas por GemeloService (objetos únicos a nivel módulo).

IMPORTANTE: estos dicts deben seguir siendo objetos únicos; los demás módulos
los importan por nombre y los mutan in-place (nunca reasignarlos)."""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Tuple

# Cache TTL en memoria por orgUnitId del índice de outcomes (el build corre
# por-estudiante, así evitamos golpear Brightspace N veces por snapshot).
_OUTCOME_SETS_CACHE: Dict[int, Tuple[float, Dict[str, Dict[str, str]]]] = {}
_OUTCOME_SETS_TTL = 600  # 10 min

# Índice de alineaciones (criterio de rúbrica → outcomeId) por curso.
# Puente entre CriteriaOutcome (sin OutcomeId) y outcomeSets, vía el
# endpoint bulk /lo/alignments/. Cacheado igual que outcomeSets.
_ALIGN_CACHE: Dict[int, Tuple[float, Dict[str, List[str]]]] = {}
_ALIGN_TTL = 600  # 10 min

# Índice de alineaciones quiz→outcomeId por curso (para RA evaluados por quiz).
_QUIZ_ALIGN_CACHE: Dict[int, Tuple[float, Dict[str, List[str]]]] = {}
_QUIZ_ALIGN_TTL = 600  # 10 min

# Cache genérico por curso para datos que NO varían por estudiante
# (dropbox folders, grade items, grade categories). Sin esto, build_gemelo()
# refetchea estos recursos N veces por snapshot (N = estudiantes del curso).
# El lock por key evita el stampede: con concurrency=8 en /ra/dashboard los
# primeros 8 builds dispararían el mismo fetch en paralelo.
_COURSE_DATA_CACHE: Dict[Tuple[str, int], Tuple[float, Any]] = {}
_COURSE_DATA_LOCKS: Dict[Tuple[str, int], asyncio.Lock] = {}
_COURSE_DATA_TTL = 300  # 5 min


async def _get_course_data_cached(kind: str, orgUnitId: int, fetch) -> Any:
    """Devuelve `fetch()` cacheado por (kind, orgUnitId) con TTL y dedup."""
    key = (kind, int(orgUnitId))
    hit = _COURSE_DATA_CACHE.get(key)
    if hit and (time.time() - hit[0]) < _COURSE_DATA_TTL:
        return hit[1]
    lock = _COURSE_DATA_LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _COURSE_DATA_CACHE.get(key)
        if hit and (time.time() - hit[0]) < _COURSE_DATA_TTL:
            return hit[1]
        data = await fetch()
        _COURSE_DATA_CACHE[key] = (time.time(), data)
        return data
