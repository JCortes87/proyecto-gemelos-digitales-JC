import React, { useState } from "react";
import { fmtGrade10FromPct } from "../../../utils/helpers";
import { parseVoiceCommand, findLowestResultStudent, findHighestRiskStudent, findStudentByName } from "../../../utils/voiceCommands";

/**
 * Búsqueda/comandos por voz del tablero (Web Speech API): interpreta el
 * comando y actualiza filtros, sección activa o estudiante seleccionado.
 * Extraído de TeacherDashboard.jsx sin cambios de comportamiento.
 */
export function useVoiceSearch({
  studentRows,
  selectedStudent,
  setVoiceFeedback,
  setAdvancedQuery,
  setOnlyRisk,
  setQuery,
  setActiveSection,
  setSelectedStudent,
  setDrawerTab,
}) {
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = React.useRef(null);

  const voiceSupported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // executeVoiceCommand MUST be declared before toggleVoice (dependency order)
  const executeVoiceCommand = React.useCallback((rawText) => {
    const command = parseVoiceCommand(rawText);
    setVoiceFeedback(command.message || "");

    switch (command.type) {
      case "navigate_section": {
        setAdvancedQuery({ mode: "text", target: null });
        setOnlyRisk(false);
        setQuery("");
        setActiveSection(command.section);
        return;
      }
      case "lowest_result_student": {
        setAdvancedQuery({ mode: "lowest-result", target: null });
        const student = findLowestResultStudent(studentRows);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — nota más baja: ${fmtGrade10FromPct(student.currentPerformancePct)}.`);
        } else {
          setVoiceFeedback("No encontré estudiantes con calificación disponible.");
        }
        return;
      }
      case "highest_risk_student": {
        setAdvancedQuery({ mode: "highest-risk", target: null });
        const student = findHighestRiskStudent(studentRows);
        if (student) {
          setActiveSection("priority");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — estudiante priorizado por riesgo académico.`);
        } else {
          setVoiceFeedback("No encontré estudiantes priorizados.");
        }
        return;
      }
      case "filter_students_risk": {
        setAdvancedQuery({ mode: "students-at-risk", target: null });
        setActiveSection("students");
        setOnlyRisk(true);
        setQuery("");
        setVoiceFeedback("Filtro activado: solo estudiantes en riesgo.");
        return;
      }
      case "filter_approved": {
        setAdvancedQuery({ mode: "text", target: null });
        setActiveSection("students");
        setOnlyRisk(false);
        setQuery(""); // will filter via advancedQuery
        setAdvancedQuery({ mode: "approved", target: null });
        setVoiceFeedback("Mostrando estudiantes aprobados (nota ≥ 7.0).");
        return;
      }
      case "find_student_by_name": {
        setAdvancedQuery({ mode: "text", target: null });
        const student = findStudentByName(studentRows, command.name);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName}.`);
        } else {
          setQuery(command.name);
          setActiveSection("students");
          setVoiceFeedback(`No encontré coincidencia exacta. Buscando: "${command.name}".`);
        }
        return;
      }
      case "open_drawer_tab": {
        setAdvancedQuery({ mode: "text", target: null });
        if (!selectedStudent) {
          const fallback = findHighestRiskStudent(studentRows);
          if (fallback) {
            setSelectedStudent(fallback);
            setDrawerTab(command.tab);
            setVoiceFeedback(`Abriendo ${command.tab} para ${fallback.displayName}.`);
          } else {
            setVoiceFeedback("No hay estudiante seleccionado. Abre uno primero.");
          }
        } else {
          setDrawerTab(command.tab);
          setVoiceFeedback(`Abriendo ${command.tab} para ${selectedStudent.displayName}.`);
        }
        return;
      }
      case "text_search": {
        setActiveSection("students");
        setOnlyRisk(false);
        setAdvancedQuery({ mode: "text", target: null });
        setQuery(command.text || "");
        return;
      }
      default: {
        // feedback already set above
      }
    }
  }, [
    studentRows, selectedStudent,
    setVoiceFeedback, setAdvancedQuery, setOnlyRisk, setQuery,
    setActiveSection, setSelectedStudent, setDrawerTab,
  ]);

  const toggleVoice = React.useCallback(() => {
    if (!voiceSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      setVoiceListening(true);
      setVoiceFeedback("🎙️ Escuchando... habla ahora");
    };
    rec.onend   = () => setVoiceListening(false);
    rec.onerror = () => {
      setVoiceListening(false);
      setVoiceFeedback("No fue posible capturar el audio. Intenta de nuevo.");
    };

    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        executeVoiceCommand(transcript);
      } else {
        setVoiceFeedback("No se detectó un comando claro.");
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [voiceListening, voiceSupported, executeVoiceCommand, setVoiceFeedback]);

  // Stop recognition on unmount
  React.useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  return { voiceListening, voiceSupported, toggleVoice };
}
