"""Helpers de cálculo: riesgo, % por outcome y prescripción."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.scale_utils import _lookup_level_points, _lookup_criterion_max_points
from app.services.risk_utils import risk_from_pct

logger = logging.getLogger("uvicorn.error")


class CalcMixin:
    # --------------------------------------------------
    # Core calc helpers
    # --------------------------------------------------
    def _risk_from_performance(
        self, pct: Optional[float], thresholds: Dict[str, float]
    ) -> str:
        return risk_from_pct(pct, thresholds)

    def _risk_from_global(
        self, pct: Any, thresholds: Optional[Dict[str, float]] = None
    ) -> str:
        return risk_from_pct(pct, thresholds)

    def _pct_from_outcome(
        self,
        co: Dict[str, Any],
        rubric_detail: Dict[str, Any],
        scale_type: str,
        max_level_points: float,
    ) -> float:
        if scale_type == "level_points":
            score = co.get("Score")
            if score is None:
                score = _lookup_level_points(rubric_detail, co.get("LevelId")) or 0.0
            if not max_level_points:
                return 0.0
            return (float(score) / float(max_level_points)) * 100.0

        score = co.get("Score", 0.0) or 0.0
        max_points = (
            _lookup_criterion_max_points(rubric_detail, co.get("CriterionId")) or 0.0
        )
        return (float(score) / float(max_points) * 100.0) if max_points else 0.0

    def _apply_prescription(
        self,
        cfg: Any,
        units: List[Dict[str, Any]],
        thresholds: Dict[str, float],
    ) -> List[Dict[str, Any]]:
        pres = (
            getattr(cfg, "prescription", None)
            if not isinstance(cfg, dict)
            else cfg.get("prescription")
        )
        if not pres:
            return []
        rules = (
            getattr(pres, "rules", None)
            if not isinstance(pres, dict)
            else pres.get("rules")
        )
        if not rules:
            return []

        watch = float(thresholds.get("watch", 70.0))
        unit_by_code = {u["code"]: u for u in units}
        out: List[Dict[str, Any]] = []

        for r in rules:
            when = getattr(r, "when", None) if not isinstance(r, dict) else r.get("when")
            do = getattr(r, "do", None) if not isinstance(r, dict) else r.get("do")
            if not when or not do:
                continue

            code = when.code if hasattr(when, "code") else when.get("code")
            below = float(
                when.belowPct if hasattr(when, "belowPct") else when.get("belowPct", 0)
            )

            u = unit_by_code.get(code)
            if u and float(u["pct"]) < below:
                route_id = do.routeId if hasattr(do, "routeId") else do.get("routeId")
                title = do.title if hasattr(do, "title") else do.get("title")
                actions = do.actions if hasattr(do, "actions") else do.get("actions", [])

                out.append(
                    {
                        "routeId": route_id,
                        "title": title,
                        "priority": [code],
                        "actions": actions,
                        "successCriteria": (
                            f"Subir {code} a ≥{watch}% en la siguiente evidencia."
                        ),
                    }
                )

        return out
