"""Fechas de vencimiento de grade items (compartido por el gemelo por
estudiante y por las métricas masivas de gradebook).

Antes vivían como closures duplicadas dentro de `_build_gemelo_inner` y de
`compute_students_gradebook_metrics`; el comportamiento es idéntico.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.services.common_utils import _parse_iso_dt


def _fill_dropbox_due_dates(
    folders: Any, out: Dict[int, Optional[datetime]]
) -> None:
    """Llena `out` (in-place) con folderId -> due date (DueDate/EndDate/
    StartDate) desde la respuesta de dropbox folders.

    Se llena in-place a propósito: si una carpeta lanza excepción a mitad de
    camino, las ya procesadas se conservan (mismo comportamiento que el loop
    original, que el llamador envuelve en try/except)."""
    if isinstance(folders, dict):
        folders = folders.get("Items") or folders.get("items") or []
    if isinstance(folders, list):
        for f in folders:
            if not isinstance(f, dict) or f.get("Id") is None:
                continue
            fid = int(f["Id"])
            due_raw = (
                f.get("DueDate")
                or f.get("EndDate")
                or f.get("StartDate")
            )
            out[fid] = _parse_iso_dt(due_raw)


def _due_date_for_grade_item(
    it: Dict[str, Any],
    dropbox_due_by_folder_id: Dict[int, Optional[datetime]],
) -> Optional[datetime]:
    assoc = it.get("AssociatedTool") or {}
    tool_id = assoc.get("ToolId")
    tool_item_id = assoc.get("ToolItemId")

    # Dropbox / Assignments suele venir con ToolId 2000
    if tool_id == 2000 and tool_item_id is not None:
        try:
            return dropbox_due_by_folder_id.get(int(tool_item_id))
        except Exception:
            return None

    return _parse_iso_dt(
        it.get("DueDate") or it.get("EndDate") or it.get("dueDate")
    )
