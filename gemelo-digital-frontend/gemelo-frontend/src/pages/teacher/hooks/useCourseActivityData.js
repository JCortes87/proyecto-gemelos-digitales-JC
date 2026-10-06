import { useEffect, useState } from "react";
import { apiGetCached } from "../../../utils/api";

/**
 * Datos de actividad del curso: accesos (classlist), equipo docente, elementos
 * de contenido, estado de entregas (dropbox) y consumo de contenidos.
 * Extraído de TeacherDashboard.jsx sin cambios de comportamiento.
 */
export function useCourseActivityData({
  orgUnitId,
  refreshKey,
}) {
  // Accesos al curso (userId -> LastAccessed ISO o null) y consumo de contenidos
  const [lastAccessMap, setLastAccessMap] = useState({});
  // Classlist crudo (para derivar el equipo docente por diferencia con estudiantes)
  const [classlistItems, setClasslistItems] = useState([]);
  // Profesores/instructores del curso (LP enrollments trae el nombre del rol)
  const [instructors, setInstructors] = useState(null); // null = cargando
  // Elementos de contenido con metadatos completos (Url/TopicType) para
  // clasificar por tipo (PDF, Word, etc.) — el content/root no trae Url
  const [contentTopics, setContentTopics] = useState(null);
  // Enlaces publicados en la descripción de las unidades (moduleLinks del
  // endpoint /content/topics): también cuentan como recursos educativos.
  const [contentModuleLinks, setContentModuleLinks] = useState([]);
  // Estado de entregas/calificación por asignación (dropbox) de TODO el curso:
  // alimenta "pendientes por calificar" (Evaluación y Feedback) y las
  // "vencidas sin entrega" por estudiante (Estudiantes prioritarios).
  const [dropboxGradingStatus, setDropboxGradingStatus] = useState(null);
  const [consumption, setConsumption] = useState(null);

  /**
   * Accesos al curso (LastAccessed del classlist) y consumo de contenidos
   * por estudiante (user progress). Best-effort: si fallan, las tarjetas
   * muestran "no disponible" sin romper el dashboard.
   */
  useEffect(() => {
    if (!orgUnitId) return;
    let alive = true;
    // Reinicio intencional al cambiar de curso o pulsar "Actualizar", antes de
    // lanzar las cargas (mismo orden y timing que tenía en TeacherDashboard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastAccessMap({});
    setClasslistItems([]);
    setInstructors(null);
    setContentTopics(null);
    setContentModuleLinks([]);
    setConsumption(null);
    setDropboxGradingStatus(null);

    (async () => {
      try {
        const ins = await apiGetCached(`/brightspace/course/${orgUnitId}/instructors`, { ttl: 300_000 });
        if (alive) setInstructors(Array.isArray(ins?.items) ? ins.items : []);
      } catch {
        if (alive) setInstructors([]);
      }
    })();

    (async () => {
      try {
        const ct = await apiGetCached(`/brightspace/course/${orgUnitId}/content/topics`, { ttl: 300_000 });
        if (alive) {
          setContentTopics(Array.isArray(ct?.items) ? ct.items : []);
          setContentModuleLinks(Array.isArray(ct?.moduleLinks) ? ct.moduleLinks : []);
        }
      } catch {
        if (alive) {
          setContentTopics([]);
          setContentModuleLinks([]);
        }
      }
    })();

    (async () => {
      try {
        const gs = await apiGetCached(`/brightspace/course/${orgUnitId}/dropbox/grading-status`, { ttl: 300_000 });
        if (alive) setDropboxGradingStatus(gs && Array.isArray(gs.items) ? gs : { items: [] });
      } catch {
        if (alive) setDropboxGradingStatus({ items: [] });
      }
    })();

    (async () => {
      try {
        const cl = await apiGetCached(`/brightspace/course/${orgUnitId}/classlist`, { ttl: 300_000 });
        if (!alive) return;
        const items = Array.isArray(cl?.items) ? cl.items : [];
        const map = {};
        for (const u of items) {
          if (u?.Identifier != null) map[String(u.Identifier)] = u.LastAccessed || null;
        }
        setLastAccessMap(map);
        setClasslistItems(items);
      } catch { /* opcional */ }
    })();

    (async () => {
      try {
        const c = await apiGetCached(`/brightspace/course/${orgUnitId}/content/consumption`, { ttl: 300_000 });
        if (alive) setConsumption(c && typeof c === "object" ? c : { perUser: {} });
      } catch {
        if (alive) setConsumption({ perUser: {} });
      }
    })();

    return () => { alive = false; };
  }, [orgUnitId, refreshKey]);

  return { lastAccessMap, classlistItems, instructors, contentTopics, contentModuleLinks, dropboxGradingStatus, consumption };
}
