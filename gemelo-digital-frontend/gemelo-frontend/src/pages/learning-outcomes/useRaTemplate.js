import { useCallback, useMemo, useRef, useState } from "react";
import { apiPost } from "../../utils/api";
import { parseRaTemplate } from "./utils";

/**
 * Creación masiva de RA desde plantilla CSV: descarga, lectura del archivo,
 * validación y ejecución (dry-run / real).
 * Extraído de LearningOutcomesAdmin.jsx sin cambios de comportamiento.
 */
export function useRaTemplate() {
  // ── Creación masiva de RA desde plantilla CSV ──
  // Cursos destino OPCIONALES (vacío = solo catálogo global) y múltiples (+).
  const [tplTargets, setTplTargets] = useState([""]);
  const [tplSets, setTplSets] = useState(null);        // [{name, rows:[{code,title}]}]
  const [tplFileName, setTplFileName] = useState("");
  const [tplErrors, setTplErrors] = useState([]);      // avisos de filas descartadas
  const [tplRunning, setTplRunning] = useState(false); // false|'dry'|'real'
  const [tplMsg, setTplMsg] = useState(null);
  const [tplResult, setTplResult] = useState(null);
  const tplFileRef = useRef(null);

  const downloadRaTemplate = useCallback(() => {
    const rows = [
      ["conjunto", "codigo", "titulo"],
      ["RA - Nombre de la asignatura", "Z1O1DOR1", "Emplear los conceptos básicos de la disciplina en la solución de problemas reales"],
      ["RA - Nombre de la asignatura", "Z1O1DOR2", "Analizar críticamente la información para tomar decisiones fundamentadas"],
      ["RA - Otra asignatura (una fila por RA; cada nombre de conjunto distinto crea un conjunto aparte)", "Z2O1DOR1", "Diseñar soluciones aplicando las metodologías del curso"],
    ];
    // BOM + ; para que Excel (es-CO) lo abra directo con acentos correctos.
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plantilla_resultados_aprendizaje.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const onTplFile = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite recargar el mismo archivo
    if (!file) return;
    setTplMsg(null); setTplResult(null);
    const apply = (text) => {
      const { sets, errors } = parseRaTemplate(text);
      setTplSets(sets); setTplErrors(errors); setTplFileName(file.name);
      if (sets.length === 0) {
        setTplMsg({ type: "err", text: errors[0] || "No se encontraron RA válidos en la plantilla." });
      }
    };
    const utf8 = new FileReader();
    utf8.onload = () => {
      const text = String(utf8.result || "");
      // Si Excel guardó en ANSI (windows-1252), la lectura UTF-8 mete "�":
      // reintentamos con esa codificación para no dañar acentos/ñ.
      if (/\uFFFD/.test(text)) {
        const ansi = new FileReader();
        ansi.onload = () => apply(String(ansi.result || ""));
        ansi.readAsText(file, "windows-1252");
      } else apply(text);
    };
    utf8.readAsText(file, "utf-8");
  }, []);

  const tplRaCount = useMemo(
    () => (tplSets || []).reduce((a, s) => a + s.rows.length, 0),
    [tplSets],
  );

  const runBulkCreate = useCallback(async (dryRun) => {
    // IDs de curso: opcionales. Entradas no vacías deben ser números válidos.
    const ids = [];
    for (const t of tplTargets) {
      const s = String(t || "").trim();
      if (!s) continue;
      if (!/^\d+$/.test(s) || parseInt(s, 10) <= 0) {
        setTplMsg({ type: "err", text: `ID de curso inválido: "${s}". Usa solo números (o deja el campo vacío).` });
        return;
      }
      const n = parseInt(s, 10);
      if (!ids.includes(n)) ids.push(n);
    }
    if (!tplSets || tplSets.length === 0) { setTplMsg({ type: "err", text: "Primero carga la plantilla CSV con los RA." }); return; }
    // Verificación con el usuario: crear SIN curso destino (solo catálogo global).
    if (ids.length === 0 && !dryRun) {
      const go = window.confirm(
        "No indicaste ningún curso destino.\n\nLos RA se crearán solo en el CATÁLOGO GLOBAL de Brightspace (nivel organización) y podrás importarlos a cursos más adelante.\n\n¿Continuar?"
      );
      if (!go) return;
    }
    setTplRunning(dryRun ? "dry" : "real"); setTplMsg(null); setTplResult(null);
    const destino = ids.length === 0
      ? "el catálogo global (sin curso)"
      : ids.length === 1 ? `el curso ${ids[0]}` : `los cursos ${ids.join(", ")}`;
    try {
      const res = await apiPost("/gemelo/outcomes/bulk-create", {
        targetOrgUnitIds: ids,
        sets: tplSets,
        dryRun: !!dryRun,
      });
      setTplResult(res);
      const nSets = res?.preview?.setCount ?? tplSets.length;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0) || tplRaCount;
      if (dryRun) {
        setTplMsg({ type: "preview", text: `Vista previa: se crearían ${nSets} conjunto(s) · ${nOut} RA en ${destino} (no se escribió nada).` });
      } else if (res?.ok) {
        setTplMsg({ type: "ok", text: `RA creados en ${destino}.${ids.length > 0 ? " Compara el Antes/Después abajo." : " Ya aparecen en el catálogo global (modo manual, paso 1)."}` });
      } else {
        const bad = (res?.results || []).filter(r => !r?.ok);
        const d = bad.map(r => `${r?.orgUnitId ?? "global"}: HTTP ${r?.status ?? "?"} ${typeof r?.detail === "string" ? r.detail : JSON.stringify(r?.detail || {})}`).join(" | ") || "sin detalle";
        setTplMsg({ type: "err", text: `Brightspace rechazó la creación en ${bad.length || "?"} destino(s): ${d.slice(0, 400)}` });
      }
    } catch (e) {
      setTplMsg({ type: "err", text: String(e?.message || "No se pudieron crear los RA.") });
    } finally {
      setTplRunning(false);
    }
  }, [tplTargets, tplSets, tplRaCount]);

  return { tplTargets, setTplTargets, tplSets, tplFileName, tplErrors, tplRunning, tplMsg, tplResult, tplFileRef, downloadRaTemplate, onTplFile, tplRaCount, runBulkCreate };
}
