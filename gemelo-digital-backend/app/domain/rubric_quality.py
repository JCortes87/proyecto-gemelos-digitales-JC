from typing import Dict, Any, List

KEYWORDS_EXCELLENCE = ["excelente", "sobresaliente", "alto", "avanzado"]
KEYWORDS_LOW = ["insuficiente", "bajo", "incipiente", "inicial", "deficiente"]

def detect_rubric_inconsistency(rubric_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    STUB — Called from gemelo_service.py during QC flag generation.
    Currently returns an empty list (no inconsistencies detected).

    Future implementation should:
    - Identify lowest-level criteria by points or order
    - Read criterion descriptors
    - Count excellence/low keywords to flag contradictions
    """
    return []