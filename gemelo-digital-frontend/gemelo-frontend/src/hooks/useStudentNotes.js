import { useState, useCallback } from "react";

// Lee { text, updatedAt } guardado para la clave; vacío si no hay o falla.
function readNote(storageKey) {
  if (!storageKey || typeof localStorage === "undefined") return { text: "", updatedAt: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { text: "", updatedAt: null };
    const parsed = JSON.parse(raw);
    return { text: parsed?.text || "", updatedAt: parsed?.updatedAt || null };
  } catch {
    return { text: "", updatedAt: null };
  }
}

/**
 * Hook for persistent private teacher notes per student.
 * Uses localStorage keyed by orgUnitId+userId.
 * Notes are private to the teacher's browser (not synced to backend).
 *
 * Usage:
 *   const { notes, setNotes, lastUpdated } = useStudentNotes(orgUnitId, userId);
 */
export default function useStudentNotes(orgUnitId, userId) {
  const storageKey = orgUnitId && userId ? `gemelo_note_${orgUnitId}_${userId}` : null;

  const [notes, setNotesState] = useState(() => readNote(storageKey).text);
  const [lastUpdated, setLastUpdated] = useState(() => readNote(storageKey).updatedAt);

  // Recargar las notas cuando cambia storageKey (se abrió otro estudiante).
  // Se ajusta durante el render comparando con la clave previa, en lugar de
  // un efecto con setState (evita un render intermedio con datos viejos).
  const [prevKey, setPrevKey] = useState(storageKey);
  if (storageKey !== prevKey) {
    setPrevKey(storageKey);
    const n = readNote(storageKey);
    setNotesState(n.text);
    setLastUpdated(n.updatedAt);
  }

  const setNotes = useCallback((text) => {
    setNotesState(text);
    if (!storageKey) return;
    try {
      const now = new Date().toISOString();
      localStorage.setItem(storageKey, JSON.stringify({ text, updatedAt: now }));
      setLastUpdated(now);
    } catch {
      // quota exceeded or disabled
    }
  }, [storageKey]);

  const clearNotes = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
      setNotesState("");
      setLastUpdated(null);
    } catch { /* storage no disponible: se conservan las notas en memoria */ }
  }, [storageKey]);

  return { notes, setNotes, lastUpdated, clearNotes };
}
