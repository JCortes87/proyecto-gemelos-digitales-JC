// Generador del documento Word maestro de Gemelo Digital CESA
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageBreak, ExternalHyperlink, PageNumber, Footer,
  Header, TableOfContents, Bookmark, InternalHyperlink,
} = require("docx");

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const allBorders = { top: border, bottom: border, left: border, right: border };

function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] });
}
function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
}
function H3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] });
}
function H4(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun({ text, bold: true })] });
}
function P(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
}
function PB(runs) {
  return new Paragraph({ children: runs, spacing: { after: 120 } });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: [new TextRun({ text })],
  });
}
function bulletRich(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: runs,
  });
}
function code(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Consolas", size: 18 })],
    shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    spacing: { after: 120 },
  });
}
function codeBlock(text) {
  return text.split("\n").map(line =>
    new Paragraph({
      children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })],
      shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    })
  );
}
function divider() {
  return new Paragraph({
    border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { after: 200, before: 200 },
  });
}

function cellText(text, bold = false, fill = null) {
  return new TableCell({
    borders: allBorders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });
}

function table2col(rows, header = ["Campo", "Valor"], widths = [3000, 6360]) {
  const headerRow = new TableRow({
    children: header.map(h => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
      width: { size: 0, type: WidthType.AUTO },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });

  const dataRows = rows.map(([col1, col2]) => new TableRow({
    children: [
      new TableCell({
        borders: allBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: widths[0], type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: col1, bold: true })] })],
      }),
      new TableCell({
        borders: allBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: widths[1], type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: col2 })] })],
      }),
    ],
  }));

  return new Table({
    width: { size: widths[0] + widths[1], type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

function table3col(rows, header = ["Col1", "Col2", "Col3"], widths = [2500, 2500, 4360]) {
  const headerRow = new TableRow({
    children: header.map(h => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });

  const dataRows = rows.map((row) => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0 })] })],
    })),
  }));

  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

// ─────────────────────────────────────────────────────────
// Construir el documento
// ─────────────────────────────────────────────────────────

const children = [];

// ── PORTADA ──
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2000, after: 200 },
  children: [new TextRun({ text: "GEMELO DIGITAL CESA", bold: true, size: 56 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Documentación maestra del proyecto", size: 32 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Estado consolidado a junio de 2026", italics: true, size: 24 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 800, after: 200 },
  children: [new TextRun({ text: "Colegio de Estudios Superiores de Administración", size: 24 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Herramienta de analítica de aprendizaje", italics: true, size: 22 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 1200, after: 200 },
  children: [new TextRun({ text: "Documento técnico para operación, mantenimiento y transferencia", size: 20 })],
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── TABLA DE CONTENIDOS ──
children.push(H1("Tabla de contenidos"));
children.push(P("Para navegar haga click en cualquier sección. En Word puede actualizar la tabla con F9.", { italics: true }));
children.push(new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-3" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 1. INTRODUCCIÓN ──
children.push(H1("1. Introducción y propósito"));
children.push(P("Este documento es la referencia consolidada del proyecto Gemelo Digital CESA. Su objetivo es que cualquier persona técnica que herede el proyecto pueda continuarlo sin pedir contexto a nadie."));
children.push(P("Cubre absolutamente todo:"));
children.push(bullet("Qué hace el sistema y para qué sirve."));
children.push(bullet("Cómo está construido (stack, arquitectura, decisiones técnicas)."));
children.push(bullet("Qué infraestructura usa en AWS."));
children.push(bullet("Cómo se despliega (CI/CD automático)."));
children.push(bullet("Cómo operarlo día a día (logs, sync, monitoreo)."));
children.push(bullet("Cómo recuperarse ante problemas (rollback, snapshots)."));
children.push(bullet("Quién es quién y cómo coordinarse con CESA y el colaborador."));

children.push(H2("1.1 Última actualización del proyecto"));
children.push(P("Junio de 2026. Última sesión de trabajo importante: integración de la arquitectura completa del colaborador (Juan David) con todas las features modernas (vista de estudiante, calendario, predicciones, alertas inteligentes, etc.) más nuestros aportes propios (refresh-token, fix de estudiantes fantasma, CI/CD vía GitHub Actions OIDC)."));

children.push(H2("1.2 Estado actual"));
children.push(P("En producción HOY (después del deploy de junio):"));
children.push(bullet("Backend: versión integrada con todas las features de JD + nuestros aportes."));
children.push(bullet("Frontend: arquitectura nueva con React Router, Context API, calendarios, alertas inteligentes, predicciones."));
children.push(bullet("Base de datos: PostgreSQL con migraciones automáticas vía start.sh."));
children.push(bullet("CI/CD: GitHub Actions OIDC desplegando backend y frontend automáticamente al mergear a main."));
children.push(bullet("Pendiente: reactivar voz TTS ElevenLabs en el chat del asistente (infraestructura intacta, falta cablear en la nueva arquitectura)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 2. QUÉ ES GEMELO DIGITAL ──
children.push(H1("2. ¿Qué es Gemelo Digital?"));
children.push(P("Herramienta de analítica de aprendizaje para CESA. Se integra con Brightspace (el LMS de CESA) y muestra a docentes, coordinadores y estudiantes información agregada y predictiva sobre el desempeño de cada curso."));
children.push(P("El nombre \"Gemelo Digital\" alude a la idea de crear una representación virtual del progreso académico de cada estudiante — su \"gemelo digital\" — para que el docente pueda actuar a tiempo sobre quienes están en riesgo."));

children.push(H2("2.1 Funcionalidades por perfil de usuario"));

children.push(H3("Vista de docente"));
children.push(bullet("Dashboard del curso con KPIs agregados: promedio de notas, cobertura de evaluación, distribución de riesgo, alertas."));
children.push(bullet("Estudiantes prioritarios — quiénes necesitan intervención y por qué."));
children.push(bullet("SmartAlerts — alertas inteligentes (cobertura baja, desempeño bajo, concentración de riesgo)."));
children.push(bullet("GradePredictions — predicción de notas finales por estudiante."));
children.push(bullet("DueDateCalendar — calendario con todas las fechas de entrega."));
children.push(bullet("EvidenceReports — reporte detallado de evidencias por estudiante."));
children.push(bullet("AINarrativeSummary — resumen narrativo del curso generado por IA."));
children.push(bullet("CoursesComparison — comparación entre cursos del mismo docente."));
children.push(bullet("CourseTrends — tendencias del curso a lo largo del semestre (persistidas en DB, históricas)."));
children.push(bullet("Descarga de evidencias y feedback del docente."));

children.push(H3("Vista de estudiante"));
children.push(bullet("Portal personal con todos sus cursos."));
children.push(bullet("Mis cursos y su rendimiento individual."));
children.push(bullet("Cortes y evidencias vencidas."));
children.push(bullet("Calendario personal con fechas de entrega."));
children.push(bullet("Proyección explicada — predicción de nota final con explicación."));

children.push(H3("Vista de coordinador"));
children.push(bullet("Vista superior de todos los cursos bajo su responsabilidad."));
children.push(bullet("Filtros por semestre y año académico."));

children.push(H3("Vista de superadmin"));
children.push(bullet("Búsqueda por ID de cualquier curso o usuario."));
children.push(bullet("Modo impersonar — ver el sistema desde la perspectiva de otro usuario para diagnóstico/soporte."));

children.push(H2("2.2 Cómo se accede"));
children.push(bullet("Embebido en Brightspace vía LTI 1.3: el docente entra desde un link dentro de su curso. Brightspace pasa la información del usuario vía un JWT y nuestro backend crea la sesión automáticamente."));
children.push(bullet("Standalone web: navegando a https://gemelo.cesa.edu.co y logueándose con su cuenta CESA (Microsoft SSO vía Brightspace OAuth)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 3. ARQUITECTURA ──
children.push(H1("3. Arquitectura general"));
children.push(P("El sistema tiene 4 \"cajoncitos\" principales que se hablan entre sí. Cada uno vive en un servicio AWS diferente."));

children.push(H2("3.1 Componentes"));
children.push(table2col([
  ["Frontend SPA", "React 19 + Vite, servido por CloudFront desde S3"],
  ["Backend API", "FastAPI Python 3.11, corriendo en ECS Fargate"],
  ["Base de datos", "PostgreSQL en RDS (gemelo-digital-db)"],
  ["LMS externo", "Brightspace (cesa.brightspace.com)"],
], ["Componente", "Tecnología y ubicación"]));

children.push(H2("3.2 Flujo entre componentes"));
children.push(P("Cuando un usuario abre la herramienta:"));
children.push(bullet("Su navegador pide los archivos estáticos (HTML/JS/CSS) a CloudFront, que los entrega desde S3."));
children.push(bullet("El SPA carga en su navegador y muestra la pantalla de login."));
children.push(bullet("El usuario inicia sesión — el SPA llama al backend API en ECS para autenticar contra Brightspace."));
children.push(bullet("El backend valida con Brightspace, crea sesión, devuelve cookie."));
children.push(bullet("El SPA pide datos del dashboard al backend."));
children.push(bullet("El backend primero busca en PostgreSQL (rápido, ~50ms). Si los datos están viejos, consulta Brightspace en vivo (~1-3s) y actualiza la DB en background."));
children.push(bullet("El SPA renderiza la información."));

children.push(H2("3.3 Diagrama ASCII de la arquitectura"));
children.push(...codeBlock(`
                        USUARIOS FINALES
                  (docentes, estudiantes, coordinadores)
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │           https://gemelo.cesa.edu.co            │
    │              CloudFront (CDN)                   │
    │           Distribution: E32WDBCT7SFCRD          │
    └────────────────────┬────────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────────┐
    │          S3 Bucket: gemelo-frontend-prod        │
    │          (archivos estáticos del SPA React)     │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │     https://ge-9d9d...ecs.us-east-1.on.aws      │
    │              ECS Fargate Service                │
    │            Cluster: default                     │
    │            Service: gemelo-digital-api          │
    │     Container: gemelo-backend:latest (ECR)      │
    │            Backend FastAPI (Python 3.11)        │
    └────────────────────┬────────────────────────────┘
                         │
                         ├─────► Brightspace API
                         │       (LMS de CESA)
                         ▼
    ┌─────────────────────────────────────────────────┐
    │           RDS PostgreSQL                        │
    │           Instance: gemelo-digital-db           │
    │           Engine: PostgreSQL 16, db.t4g.micro   │
    └─────────────────────────────────────────────────┘
`));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 4. STACK TECNOLÓGICO ──
children.push(H1("4. Stack tecnológico"));

children.push(H2("4.1 Backend"));
children.push(table2col([
  ["Lenguaje", "Python 3.11"],
  ["Framework web", "FastAPI 0.115"],
  ["Servidor ASGI", "Uvicorn 0.30"],
  ["ORM", "SQLAlchemy 2.0"],
  ["Migraciones DB", "Alembic 1.14"],
  ["Driver PostgreSQL", "psycopg 3.2 (psycopg3)"],
  ["HTTP client (Brightspace API)", "httpx 0.27"],
  ["Autenticación JWT", "python-jose"],
  ["Criptografía LTI", "cryptography"],
  ["TTS opcional", "ElevenLabs API"],
  ["Contenedor", "Docker (Python 3.11-slim base)"],
]));

children.push(H2("4.2 Frontend"));
children.push(table2col([
  ["Framework", "React 19"],
  ["Bundler", "Vite 8"],
  ["Routing", "React Router"],
  ["Estado global", "Context API (Auth, Course, I18n, Theme, Toast)"],
  ["Charts", "Recharts 3.7"],
  ["Estilos", "CSS Modules"],
  ["Lenguaje", "JavaScript (ES2022+) + algunos archivos TypeScript"],
]));

children.push(H2("4.3 Infraestructura"));
children.push(table2col([
  ["Cloud provider", "AWS"],
  ["Región principal", "us-east-1 (North Virginia)"],
  ["ID de cuenta AWS", "718624265053"],
  ["Compute backend", "ECS Fargate (modo Exprés)"],
  ["Registry imágenes", "ECR (Elastic Container Registry)"],
  ["Hosting frontend", "S3 + CloudFront"],
  ["Base de datos", "RDS PostgreSQL"],
  ["Identidad", "IAM con OIDC para GitHub Actions"],
  ["CI/CD", "GitHub Actions"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 5. REPOSITORIOS ──
children.push(H1("5. Repositorios del proyecto"));
children.push(P("Hay 3 repositorios relevantes. Solo el primero recibe pushes."));

children.push(H2("5.1 Repositorio principal (production)"));
children.push(table2col([
  ["URL", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC"],
  ["Dueño actual", "JCortes87"],
  ["Branch productiva", "main (cada merge dispara deploy automático)"],
  ["Branch de trabajo histórica", "sync/upstream-abril-2026"],
]));

children.push(H2("5.2 Repositorio del colaborador (referencia, solo lectura)"));
children.push(table2col([
  ["URL", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales"],
  ["Dueño", "Juan David"],
  ["Uso", "Referencia para revisar su versión. NUNCA empujar desde nuestro setup."],
  ["Push status", "DISABLED-no-push-to-upstream (explícitamente desactivado en git config)"],
]));

children.push(H2("5.3 Repositorio fork inicial (archivado)"));
children.push(table2col([
  ["URL", "https://github.com/JCortes87/gemelo-digital-backend-JC"],
  ["Estado", "Archivado. Era un experimento inicial."],
  ["Branch histórica", "integracion/manual-controlada"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 6. URLs DE PRODUCCIÓN ──
children.push(H1("6. URLs de producción y endpoints"));

children.push(H2("6.1 URL principal (usuarios finales)"));
children.push(PB([new TextRun({ text: "Frontend SPA: ", bold: true }), new TextRun({ text: "https://gemelo.cesa.edu.co" })]));
children.push(P("Servido por CloudFront, distribución E32WDBCT7SFCRD. El dominio gemelo.cesa.edu.co apunta vía CNAME a la distribución."));

children.push(H2("6.2 URL del backend API"));
children.push(P("URL directa de ECS Fargate:"));
children.push(code("https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws"));
children.push(P("El frontend la consume vía la variable VITE_API_BASE_URL definida en .env.production."));

children.push(H2("6.3 Endpoints clave del backend"));
children.push(table3col([
  ["GET /health", "Público", "Health check. Esperado: {\"status\":\"ok\"}"],
  ["GET /debug/db", "Público", "Ping a PostgreSQL. Esperado: {\"db_ok\":true}"],
  ["GET /auth/brightspace/login", "Público", "Inicia el OAuth flow con Brightspace"],
  ["GET /auth/brightspace/callback", "Brightspace", "Callback OAuth, recibe code, genera sesión"],
  ["GET /auth/me", "Sesión", "Devuelve info del usuario logueado"],
  ["POST /auth/logout", "Sesión", "Cierra sesión"],
  ["GET /gemelo/course/{ou}/overview", "Sesión", "Overview agregado del curso (DB-first con fallback Brightspace)"],
  ["GET /gemelo/course/{ou}/student/{userId}", "Sesión", "Gemelo digital de un estudiante"],
  ["GET /gemelo/course/{ou}/students", "Sesión", "Lista de estudiantes del curso"],
  ["GET /gemelo/course/{ou}/ra/dashboard", "Sesión", "Dashboard de Resultados de Aprendizaje"],
  ["GET /debug/course/{ou}/overview-db", "Público", "Overview desde DB sin auth"],
  ["POST /admin/sync-cron-all", "Header secret", "Sincroniza todos los cursos. Para scheduler."],
  ["GET /admin/show-refresh-token", "Sesión", "TEMPORAL: captura refresh_token. Eliminar tras usar."],
  ["POST /speech/tts", "Sesión", "Texto a voz vía ElevenLabs"],
  ["POST /speech/stt", "Sesión", "Voz a texto vía ElevenLabs"],
  ["GET /.well-known/jwks.json", "Público", "JWKS público para LTI 1.3"],
  ["POST /lti/login", "Brightspace", "OIDC login initiation LTI 1.3"],
  ["POST /lti/launch", "Brightspace", "LTI launch endpoint"],
], ["Endpoint", "Autenticación", "Descripción"], [3000, 1800, 4560]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 7. INFRAESTRUCTURA AWS DETALLADA ──
children.push(H1("7. Infraestructura AWS — detalle completo"));
children.push(P("Toda la infraestructura está en us-east-1 (Virginia) en la cuenta AWS 718624265053."));

children.push(H2("7.1 ECS (Elastic Container Service)"));
children.push(P("Donde corre el backend del proyecto en un container Docker."));
children.push(table2col([
  ["Cluster", "default"],
  ["Service", "gemelo-digital-api (modo Exprés)"],
  ["Task Definition", "default-gemelo-digital-api:73 (o revisión más reciente)"],
  ["CPU", "1 vCPU (1024 unidades)"],
  ["Memoria", "2 GiB (2048 MiB)"],
  ["Health check path", "/health"],
  ["Puerto", "8000"],
  ["Tareas activas", "1"],
  ["Rol de ejecución", "ecsTaskExecutionRole"],
  ["Rol de infraestructura", "ecsInfrastructureRoleForExpressServices"],
]));

children.push(H2("7.2 ECR (Elastic Container Registry)"));
children.push(P("Donde se guardan las imágenes Docker del backend."));
children.push(table2col([
  ["Repositorio", "gemelo-backend"],
  ["URI", "718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend"],
  ["Tag 'latest'", "Imagen más reciente desplegada (siempre actualizada por CI/CD)"],
  ["Tag <sha>", "Una etiqueta por cada commit, para trazabilidad y rollback"],
]));
children.push(P("Otros repos que existen en ECR pero NO se usan en este proyecto:"));
children.push(bullet("cesa-backend — otro proyecto CESA."));
children.push(bullet("gemelo-digital/gemelo-digital-backend — repo histórico, abandonado."));

children.push(H2("7.3 RDS (PostgreSQL)"));
children.push(P("Base de datos principal del proyecto."));
children.push(table2col([
  ["Identifier", "gemelo-digital-db"],
  ["Engine", "PostgreSQL 16"],
  ["Clase de instancia", "db.t4g.micro"],
  ["Endpoint", "gemelo-digital-db.crp1lzwejl3x.us-east-1.rds.amazonaws.com"],
  ["Puerto", "5432"],
  ["Nombre de la base", "gemelo_digital"],
  ["Usuario administrador", "gemelo_admin"],
  ["Password", "En el taskdef de ECS, dentro de DATABASE_URL"],
  ["Backups automáticos", "Configurados por AWS (retención por defecto)"],
  ["Snapshots manuales", "Tomar antes de cada deploy de riesgo"],
]));

children.push(H2("7.4 S3 (Frontend)"));
children.push(table2col([
  ["Bucket", "gemelo-frontend-prod"],
  ["Versioning", "Activo (permite rollback por archivo)"],
  ["Política de acceso", "Privado, entregado vía CloudFront con OAC"],
]));

children.push(H2("7.5 CloudFront (CDN)"));
children.push(table2col([
  ["Distribution ID", "E32WDBCT7SFCRD"],
  ["Dominio asociado", "gemelo.cesa.edu.co"],
  ["Origen", "S3 bucket gemelo-frontend-prod"],
  ["Cache", "Invalidation /* después de cada deploy frontend"],
]));

children.push(H2("7.6 IAM (Identidad y permisos)"));
children.push(P("Rol que GitHub Actions asume para hacer los deploys:"));
children.push(table2col([
  ["Nombre del rol", "GemeloDigitalDeployerRole"],
  ["ARN", "arn:aws:iam::718624265053:role/GemeloDigitalDeployerRole"],
  ["Policy asociada", "GemeloDigitalDeployerPolicy"],
  ["Permisos", "ECR push/pull + ECS update + S3 sync + CloudFront invalidate"],
  ["Trust", "Solo workflows del repo JCortes87/proyecto-gemelos-digitales-JC vía OIDC"],
]));
children.push(P("OIDC Provider:"));
children.push(code("arn:aws:iam::718624265053:oidc-provider/token.actions.githubusercontent.com"));

children.push(H2("7.7 CloudWatch Logs"));
children.push(P("Donde se ven los logs del backend en producción:"));
children.push(code("/aws/ecs/default/gemelo-digital-api-cbc4"));
children.push(P("Aquí se ven los logs de uvicorn: arranque, requests, errores, logs propios del backend."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 8. BASE DE DATOS ──
children.push(H1("8. Base de datos — esquema y migraciones"));

children.push(H2("8.1 Tablas principales"));
children.push(P("Definidas en app/db/models.py:"));
children.push(table3col([
  ["courses", "Catálogo", "Cursos sincronizados desde Brightspace"],
  ["students", "Catálogo", "Catálogo de estudiantes"],
  ["enrollments", "Relación", "Inscripciones estudiante × curso, con is_active"],
  ["grade_items", "Catálogo", "Items de calificación del gradebook"],
  ["dropbox_folders", "Catálogo", "Carpetas de entrega de Brightspace"],
  ["outcome_sets", "Catálogo", "Sets de resultados de aprendizaje"],
  ["student_course_metric_snapshots", "Métrica", "Snapshot diario de métricas por estudiante"],
  ["course_metric_history", "Métrica", "Histórico diario de métricas agregadas del curso (para trends)"],
  ["sync_runs", "Operación", "Bitácora de ejecuciones de sync"],
  ["sync_state", "Operación", "Estado del último sync por curso"],
  ["sync_errors", "Operación", "Errores de sync para diagnóstico"],
], ["Tabla", "Tipo", "Para qué"]));

children.push(H2("8.2 Cadena de migraciones Alembic"));
children.push(P("Orden actual de aplicación:"));
children.push(...codeBlock(`0001_initial_schema
  → 87095c55fccf  (add_sync_control_tables — placeholder)
  → ef7efb89bf39  (add_sync_control_tables — placeholder)
  → 712ebad8e3d1  (add_sync_control_tables — placeholder)
  → b6f1918135ed  (add_student_metric_snapshots — placeholder)
  → a1b2c3d4e5f6  (add_date_fields_to_grade_items_dropbox)
  → c3d4e5f6a7b8  (add_course_metric_history)   ← HEAD actual`));

children.push(H2("8.3 Aplicación automática de migraciones"));
children.push(P("Las migraciones se aplican automáticamente al arrancar el container, gracias al script start.sh:"));
children.push(...codeBlock(`#!/bin/bash
set -e
if [ -n "$DATABASE_URL" ]; then
  echo "[startup] Running database migrations..."
  alembic upgrade head
  echo "[startup] Migrations complete."
else
  echo "[startup] DATABASE_URL not set — skipping migrations."
fi
exec uvicorn main:app --host 0.0.0.0 --port 8000`));
children.push(P("Esto significa que cada deploy verifica las migraciones y aplica las nuevas. No hay que ejecutarlas manualmente."));
children.push(P("Si una migración falla, set -e hace que el container no arranque. ECS detecta el fallo y mantiene los containers viejos corriendo. Así, una migración mal hecha NO tumba producción — pero hay que arreglarla rápido o desplegar la versión anterior."));

children.push(H2("8.4 Acceso directo a la base de datos"));
children.push(P("Para consultas SQL ad-hoc:"));
children.push(bullet("AWS Console → RDS → Bases de datos → gemelo-digital-db → \"Editor de consultas\"."));
children.push(bullet("Conexión psql con la cadena DATABASE_URL (que vive en el taskdef de ECS)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 9. CI/CD ──
children.push(H1("9. CI/CD — Despliegue automático"));

children.push(H2("9.1 Cómo se dispara el deploy"));
children.push(P("Cualquier push a main que toque archivos en estos paths:"));
children.push(table2col([
  ["gemelo-digital-backend/**", "Dispara el workflow del backend"],
  ["gemelo-digital-frontend/**", "Dispara el workflow del frontend"],
  [".github/workflows/deploy-*.yml", "Dispara el workflow correspondiente"],
], ["Path que cambia", "Acción"]));

children.push(H2("9.2 Disparar manualmente"));
children.push(P("Para re-desplegar sin un commit nuevo (ej. tras cambiar variables de entorno en taskdef):"));
children.push(bullet("Ir a GitHub → repo → Actions."));
children.push(bullet("Click en \"Deploy backend a ECS\" o \"Deploy frontend a S3 y CloudFront\"."));
children.push(bullet("Click \"Run workflow\" arriba a la derecha."));
children.push(bullet("Seleccionar branch (main) y confirmar."));

children.push(H2("9.3 Workflow del backend — pasos"));
children.push(P("Definido en .github/workflows/deploy-backend.yml:"));
children.push(bullet("Checkout del código.", 0));
children.push(bullet("Configurar credenciales AWS vía OIDC (asume el rol GemeloDigitalDeployerRole).", 0));
children.push(bullet("Login a ECR.", 0));
children.push(bullet("Build de la imagen Docker desde gemelo-digital-backend/.", 0));
children.push(bullet("Push a ECR con tags latest y SHA del commit.", 0));
children.push(bullet("aws ecs update-service --force-new-deployment.", 0));
children.push(bullet("Espera con aws ecs wait services-stable hasta que el servicio esté saludable.", 0));
children.push(P("Tiempo total: ~10 minutos."));

children.push(H2("9.4 Workflow del frontend — pasos"));
children.push(P("Definido en .github/workflows/deploy-frontend.yml:"));
children.push(bullet("Checkout del código.", 0));
children.push(bullet("Setup Node.js 20.", 0));
children.push(bullet("npm ci en gemelo-digital-frontend/gemelo-frontend/.", 0));
children.push(bullet("npm run build (Vite construye dist/).", 0));
children.push(bullet("Configurar credenciales AWS vía OIDC.", 0));
children.push(bullet("aws s3 sync ./dist/ s3://gemelo-frontend-prod --delete.", 0));
children.push(bullet("aws cloudfront create-invalidation --paths \"/*\".", 0));
children.push(P("Tiempo total: ~2-3 minutos."));

children.push(H2("9.5 Seguridad del CI/CD"));
children.push(bullet("Sin Access Keys: usa OIDC para credenciales temporales (vencen al terminar el job)."));
children.push(bullet("Trust scope: solo se aceptan workflows desde JCortes87/proyecto-gemelos-digitales-JC. Cualquier intento desde otro repo es rechazado por AWS."));
children.push(bullet("Policy mínima: el rol solo tiene los permisos exactos para ECR, ECS, S3 y CloudFront del proyecto. No puede tocar otros recursos."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 10. VARIABLES DE ENTORNO ──
children.push(H1("10. Variables de entorno (producción)"));
children.push(P("Definidas en el taskdef de ECS, sección environment. Cuando cambias una, hay que registrar una nueva revisión del taskdef y forzar redeploy."));

children.push(H2("10.1 Brightspace OAuth"));
children.push(table2col([
  ["BRIGHTSPACE_CLIENT_ID", "Client ID OAuth registrado en Brightspace"],
  ["BRIGHTSPACE_CLIENT_SECRET", "Client secret correspondiente"],
  ["BRIGHTSPACE_REDIRECT_URI", "URL de callback OAuth (debe coincidir con Brightspace)"],
  ["BRIGHTSPACE_AUTH_URL", "https://auth.brightspace.com/oauth2/auth"],
  ["BRIGHTSPACE_TOKEN_URL", "https://auth.brightspace.com/core/connect/token"],
  ["BRIGHTSPACE_BASE_URL", "https://cesa.brightspace.com"],
  ["BRIGHTSPACE_SCOPE", "Scope OAuth con permisos a la API"],
  ["BRIGHTSPACE_LP_VERSION", "Versión API LP (Learning Platform)"],
  ["BRIGHTSPACE_LE_VERSION", "Versión API LE (Learning Experience)"],
]));

children.push(H2("10.2 LTI 1.3"));
children.push(table2col([
  ["LTI_CLIENT_ID", "Client ID de la herramienta LTI"],
  ["LTI_ISSUER", "https://cesa.brightspace.com"],
  ["LTI_AUTH_ENDPOINT", "https://cesa.brightspace.com/d2l/lti/authenticate"],
  ["LTI_JWKS_URL", "https://cesa.brightspace.com/d2l/.well-known/jwks"],
]));

children.push(H2("10.3 Base de datos"));
children.push(table2col([
  ["DATABASE_URL", "URL de conexión a RDS (formato: postgresql+psycopg://user:password@host:5432/dbname)"],
]));

children.push(H2("10.4 URLs"));
children.push(table2col([
  ["FRONTEND_BASE_URL", "https://gemelo.cesa.edu.co"],
  ["TOOL_BASE_URL", "URL pública del backend en ECS"],
]));

children.push(H2("10.5 ElevenLabs (opcional)"));
children.push(table2col([
  ["ELEVENLABS_API_KEY", "Si está, /speech/* funciona"],
  ["ELEVENLABS_VOICE_ID", "ID de voz por defecto"],
]));

children.push(H2("10.6 Secrets internos"));
children.push(table2col([
  ["SESSION_SECRET", "Para firmar el state en OAuth"],
  ["LTI_STATE_SECRET", "Para firmar el state en LTI"],
  ["LTI_PRIVATE_KEY_PATH", "Path a la llave RSA para firmar JWTs LTI"],
]));

children.push(H2("10.7 Scheduler (cuando se active)"));
children.push(table2col([
  ["BRIGHTSPACE_SERVICE_REFRESH_TOKEN", "Refresh token de cuenta de servicio para sync automático"],
  ["CRON_SHARED_SECRET", "Secret para autenticar al scheduler externo"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 11. OPERACIONES COMUNES ──
children.push(H1("11. Operaciones comunes — recetario"));
children.push(P("Cómo hacer las cosas más frecuentes."));

children.push(H2("11.1 Hacer un cambio de código y desplegarlo"));
children.push(bullet("Hacer el cambio localmente en una rama (típicamente sync/upstream-abril-2026 o nueva).", 0));
children.push(bullet("git add + git commit con mensaje descriptivo.", 0));
children.push(bullet("Abrir un Pull Request a main en GitHub.", 0));
children.push(bullet("Revisar el diff en \"Files changed\" del PR.", 0));
children.push(bullet("Mergear el PR (botón verde).", 0));
children.push(bullet("GitHub Actions deploya automáticamente. Ver progreso en pestaña Actions.", 0));

children.push(H2("11.2 Ver los logs del backend en producción"));
children.push(P("Opción 1: AWS Console → CloudWatch → Log groups → /aws/ecs/default/gemelo-digital-api-cbc4."));
children.push(P("Opción 2: ECS Console → cluster default → service gemelo-digital-api → pestaña \"Registros\" (Logs)."));

children.push(H2("11.3 Ver qué imagen está corriendo"));
children.push(P("ECS Console → service → pestaña Configuración → buscar línea \"Imagen\". Muestra algo como:"));
children.push(code("718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest"));
children.push(P("Si quieres ver el SHA exacto del commit que está corriendo, ver el tag en ECR."));

children.push(H2("11.4 Forzar un redeploy sin cambios de código"));
children.push(P("Útil tras cambiar variables de entorno en taskdef."));
children.push(bullet("ECS Console → service.", 0));
children.push(bullet("Click \"Actualizar servicio\" (Update service).", 0));
children.push(bullet("Marcar la casilla \"Forzar nueva implementación\" (Force new deployment).", 0));
children.push(bullet("Click \"Actualizar\" (Update).", 0));
children.push(P("Alternativa: ir a GitHub Actions → Run workflow del backend."));

children.push(H2("11.5 Tomar un snapshot manual de la base de datos"));
children.push(bullet("RDS Console → bases de datos → gemelo-digital-db.", 0));
children.push(bullet("Click el botón \"Acciones\" arriba a la derecha.", 0));
children.push(bullet("Click \"Realizar instantánea\" (Take snapshot).", 0));
children.push(bullet("Nombre descriptivo (ej. pre-deploy-2026-06-15).", 0));
children.push(bullet("Click confirmar.", 0));

children.push(H2("11.6 Disparar un sync manual desde la web"));
children.push(P("Loguearse en https://gemelo.cesa.edu.co. Luego, con sesión activa, llamar al endpoint:"));
children.push(code("POST https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/debug/sync/master/{orgUnitId}"));
children.push(P("Reemplazar {orgUnitId} por el ID del curso (ej. 41742). Esto sincroniza classlist + snapshots de ese curso."));

children.push(H2("11.7 Cambiar una variable de entorno en producción"));
children.push(bullet("ECS Console → cluster default → service gemelo-digital-api.", 0));
children.push(bullet("Pestaña Configuración → click \"Editar\".", 0));
children.push(bullet("Buscar la sección \"Variables de entorno\" del container.", 0));
children.push(bullet("Cambiar el valor (o agregar nueva).", 0));
children.push(bullet("Guardar — esto registra una nueva revisión del taskdef.", 0));
children.push(bullet("ECS Console → service → forzar nueva implementación para que el container la recoja.", 0));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 12. ROLLBACK ──
children.push(H1("12. Rollback y recuperación"));
children.push(P("Cómo deshacer si algo sale mal."));

children.push(H2("12.1 Si un deploy de backend rompe producción"));

children.push(H3("Opción A: revertir imagen en ECS"));
children.push(bullet("ECR Console → repositorio gemelo-backend → identificar el SHA de la imagen anterior.", 0));
children.push(bullet("Tag esa imagen como 'latest' (esto sobreescribe el tag actual).", 0));
children.push(bullet("ECS Console → service → forzar nueva implementación.", 0));
children.push(P("El container nuevo pulleará la imagen vieja por su tag latest."));

children.push(H3("Opción B: revertir vía git"));
children.push(bullet("Localmente: git revert <hash-del-commit-malo>.", 0));
children.push(bullet("git push origin main.", 0));
children.push(bullet("GitHub Actions deploya la versión revertida automáticamente.", 0));
children.push(P("Más limpio que la opción A porque queda registro en la historia de git."));

children.push(H3("Opción C (emergencia): backup branch"));
children.push(bullet("Hay un branch backup/pre-merge-jd-junio-10 en GitHub con el estado pre-merge.", 0));
children.push(bullet("git checkout main && git reset --hard backup/pre-merge-jd-junio-10.", 0));
children.push(bullet("git push origin main --force (operación destructiva).", 0));
children.push(P("Solo usar en emergencia extrema. Pierdes commits que no estén en el backup."));

children.push(H2("12.2 Si un deploy de frontend rompe la web"));

children.push(H3("Opción rápida: versiones S3"));
children.push(bullet("S3 Console → bucket gemelo-frontend-prod.", 0));
children.push(bullet("Activar \"Show versions\" en la lista de objetos.", 0));
children.push(bullet("Para cada archivo afectado (index.html, /assets/*), restaurar la versión anterior con \"Actions → Restore\".", 0));
children.push(bullet("CloudFront Console → distribución E32WDBCT7SFCRD → crear invalidation /*.", 0));

children.push(H3("Opción robusta: revertir vía git"));
children.push(P("Misma estrategia que backend opción B. El workflow del frontend deploya la versión revertida."));

children.push(H2("12.3 Si la base de datos se corrompe"));
children.push(bullet("RDS Console → Snapshots → buscar el snapshot reciente.", 0));
children.push(bullet("Click \"Acciones → Restaurar instantánea\" — crea una instancia nueva.", 0));
children.push(bullet("Esperar a que la instancia nueva esté \"Available\".", 0));
children.push(bullet("Cambiar DATABASE_URL en el taskdef para apuntar al endpoint de la instancia nueva.", 0));
children.push(bullet("Forzar redeploy en ECS.", 0));
children.push(P("Restaurar una DB es operación destructiva — solo hacerlo si realmente hay corrupción de datos."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 13. COORDINACIÓN HUMANA ──
children.push(H1("13. Coordinación humana"));

children.push(H2("13.1 Quién es quién"));
children.push(table2col([
  ["Juan David", "Colaborador original del proyecto. Su repo es el histórico de referencia. Para integrar features nuevas de él, hacer git fetch colaborador y mergear con cuidado."],
  ["JCortes87", "Dueño actual del proyecto. Tiene CI/CD configurado y hace los deploys vía GitHub Actions."],
  ["CESA admin AWS", "Quien administra la cuenta AWS 718624265053. Pedirle permisos adicionales si se necesitan nuevas integraciones."],
  ["CESA admin Brightspace", "Quien gestiona apps OAuth y LTI en Brightspace. Pedirle registro de nuevas URLs de redirect o herramientas LTI."],
], ["Persona / rol", "Función y cómo contactar"]));

children.push(H2("13.2 Transferir el proyecto a otra persona"));
children.push(bullet("Darle acceso al repo en GitHub: Settings → Collaborators → invite collaborator.", 0));
children.push(bullet("Eventualmente transferir el repo a una GitHub Organization de CESA para que quede del área, no de la persona.", 0));
children.push(bullet("Tras transferir, actualizar el trust policy del IAM role GemeloDigitalDeployerRole para que apunte al nuevo path del repo (<org>/proyecto-gemelos-digitales-JC en lugar de JCortes87/...).", 0));

children.push(H2("13.3 Acceso a AWS"));
children.push(P("URL de login para CESA:"));
children.push(code("https://718624265053.signin.aws.amazon.com/console"));
children.push(P("Login con IAM username + password + MFA. El usuario debe tener permisos para los servicios usados (ECS, ECR, RDS, S3, CloudFront, IAM, CloudWatch)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 14. DECISIONES TÉCNICAS ──
children.push(H1("14. Decisiones técnicas (contexto histórico)"));
children.push(P("Estas decisiones se tomaron en el pasado. Conocerlas evita romper invariantes."));

children.push(H2("14.1 Por qué tener Postgres además de Brightspace"));
children.push(P("Brightspace es la fuente de verdad de los datos académicos. Pero consultarlo en cada request es lento (1-3 segundos por endpoint). Por eso se sincronizan snapshots a Postgres y los endpoints \"DB-first\" sirven desde ahí (~50ms). Si los datos en DB están viejos (>30 min), se cae al path Brightspace y se persiste de vuelta en background."));
children.push(P("Mejora típica: 95% de los hits a dashboard se sirven en menos de 100ms, contra 1-3s si fueran directos a Brightspace."));

children.push(H2("14.2 Por qué autenticación dual (OAuth + LTI)"));
children.push(P("OAuth: para login standalone desde la web (gemelo.cesa.edu.co). Permite que un docente acceda sin estar en Brightspace en ese momento."));
children.push(P("LTI 1.3: para que la herramienta se embeba dentro de Brightspace (el docente entra desde un link en su curso, no hace login porque ya está logueado en Brightspace)."));
children.push(P("Ambas convergen en el mismo SESSION_STORE con la cookie gemelo_session_id."));

children.push(H2("14.3 Por qué sync_classlist desactiva enrollments"));
children.push(P("Si un estudiante se sale del curso en Brightspace, su classlist deja de incluirlo. Antes, sus datos viejos seguían apareciendo en \"Estudiantes prioritarios\" para siempre."));
children.push(P("Ahora sync_classlist acumula los IDs vistos durante la sincronización y al final marca como is_active=False cualquier enrollment activo cuyo brightspace_user_id no haya aparecido."));
children.push(P("Las consultas de overview filtran por is_active=True para excluir automáticamente a los \"fantasmas\"."));

children.push(H2("14.4 Por qué hay refresh-token automático"));
children.push(P("El access_token de Brightspace dura ~1 hora. Sin refresh-token, el dashboard se quedaba sin datos después de 1 hora idle: la cookie seguía válida (TTL 8h) pero las API calls a Brightspace fallaban con 401."));
children.push(P("Ahora el backend detecta cuando al token le quedan <5 minutos y lo refresca silenciosamente usando el refresh_token que Brightspace entrega en el login. El usuario no se entera."));

children.push(H2("14.5 Por qué workflow_dispatch en GitHub Actions"));
children.push(P("Permite disparar deploys manuales desde la pestaña Actions de GitHub sin necesidad de hacer un commit. Útil para re-desplegar la misma versión (ej. tras cambiar una variable de entorno en taskdef)."));

children.push(H2("14.6 Por qué start.sh corre las migraciones automáticamente"));
children.push(P("Antes, había que ejecutar alembic upgrade head manualmente después de cada deploy. Eso es propenso al olvido y a inconsistencias entre código y schema."));
children.push(P("Ahora el container ejecuta migraciones al arrancar. Si una migración falla, set -e hace que el container muera, ECS no remplaza los containers viejos, y producción sigue funcionando con la versión anterior."));

children.push(H2("14.7 Por qué push al colaborador está deshabilitado"));
children.push(P("El repo del colaborador (Juan David) es referencia, no destino. Para evitar empujarle código por accidente, se configuró:"));
children.push(code("git remote set-url --push colaborador DISABLED-no-push-to-upstream"));
children.push(P("Cualquier intento de git push colaborador <algo> falla con un error claro de URL inválida."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 15. TRABAJO REALIZADO EN ESTA SESIÓN ──
children.push(H1("15. Trabajo realizado en la sesión de junio 2026"));
children.push(P("Listado cronológico de los cambios mayores trabajados en esta sesión, para referencia."));

children.push(H2("15.1 Integración con repo del colaborador"));
children.push(bullet("Fetch del repo colaborador para ver su versión más reciente."));
children.push(bullet("Análisis de las 52+ commits que JD había avanzado: arquitectura nueva del frontend (React Router, Context API), nuevas features (calendar, predictions, alerts, vista estudiante)."));
children.push(bullet("Merge controlado de colaborador/main al main local."));
children.push(bullet("Resolución del único conflicto: línea de imports en gemelo_db_service.py (combinar Enrollment + CourseMetricHistory)."));
children.push(bullet("Limpieza de archivos basura del merge (cf-config-tmp.json, commits.json, etc.)."));
children.push(bullet("Push del merge a main."));

children.push(H2("15.2 Configuración del CI/CD desde cero"));
children.push(bullet("Creación del OIDC Identity Provider en AWS IAM para confiar en GitHub Actions."));
children.push(bullet("Creación del rol GemeloDigitalDeployerRole con permisos exactos (ECR, ECS, S3, CloudFront)."));
children.push(bullet("Creación de la policy GemeloDigitalDeployerPolicy."));
children.push(bullet("Creación de los 2 workflows: deploy-backend.yml y deploy-frontend.yml."));
children.push(bullet("Primer deploy automático ejecutado y verificado en producción."));

children.push(H2("15.3 Refresh-token en sesiones de usuario"));
children.push(bullet("Implementación del flujo de refresh-token automático cuando al access_token le quedan <5 min."));
children.push(bullet("Nuevo módulo brightspace_auth.py con mint_access_token_from_refresh()."));
children.push(bullet("Nueva función update_session_tokens() en app/state.py."));
children.push(bullet("Modificación de BrightspaceClient para refresh proactivo."));

children.push(H2("15.4 Fix de estudiantes \"fantasma\""));
children.push(bullet("sync_classlist ahora acumula IDs vistos y marca como inactivos los enrollments que ya no están en Brightspace."));
children.push(bullet("build_course_overview_from_db filtra por is_active=True para excluir estudiantes inactivos."));
children.push(bullet("Cron y background task del overview ejecutan sync_classlist + sync_student_metric_snapshots."));

children.push(H2("15.5 Endpoints administrativos para scheduler"));
children.push(bullet("POST /admin/sync-cron-all — para sync automático disparado por scheduler externo (AWS EventBridge)."));
children.push(bullet("GET /admin/show-refresh-token — herramienta temporal para capturar refresh_token de cuenta de servicio."));
children.push(bullet("Nuevo módulo app/services/cron_runner.py."));
children.push(bullet("Documentación detallada en docs/setup-scheduler.md."));

children.push(H2("15.6 Refactor del backend"));
children.push(bullet("Extracción de 27 helpers de gemelo_service.py (2107 líneas) a 6 módulos por dominio:"));
children.push(bullet("text_utils.py — limpieza de HTML, normalización.", 1));
children.push(bullet("common_utils.py — coerción numérica, datetime, dict.", 1));
children.push(bullet("grade_filters.py — predicados sobre grade values.", 1));
children.push(bullet("scale_utils.py — thresholds, escalas, rúbricas.", 1));
children.push(bullet("risk_utils.py — roll-up a macrocompetencias.", 1));
children.push(bullet("role_utils.py — roles, identificación, classlist.", 1));
children.push(bullet("gemelo_service.py bajó de 2107 a 1645 líneas (-22%)."));

children.push(H2("15.7 Documentación"));
children.push(bullet("Creación de docs/PROYECTO-GEMELO-DIGITAL-COMPLETO.md (650 líneas)."));
children.push(bullet("Creación de docs/setup-scheduler.md (guía AWS EventBridge)."));
children.push(bullet("Creación de este documento Word."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 16. PENDIENTES Y SIGUIENTES PASOS ──
children.push(H1("16. Pendientes y siguientes pasos sugeridos"));
children.push(P("Lo que queda por hacer cuando se retome el proyecto."));

children.push(H2("16.1 Pendientes de corto plazo"));
children.push(bullet("Reactivar la voz TTS ElevenLabs en el chat del asistente. La infraestructura backend está intacta (endpoints /speech/* funcionan). En el frontend nuevo de JD, los utils voice.js y speech.js están preservados; falta cablearlos en useStudentChat.js o el componente del chat."));
children.push(bullet("Reintegrar el fix de no-superposición de audios (AbortController + token monotónico) cuando se reactive la voz."));

children.push(H2("16.2 Pendientes de mediano plazo"));
children.push(bullet("Configurar el scheduler de sincronización automática vía AWS EventBridge. Guía completa en docs/setup-scheduler.md."));
children.push(bullet("Capturar refresh_token de cuenta de servicio usando /admin/show-refresh-token."));
children.push(bullet("Eliminar el endpoint /admin/show-refresh-token una vez capturado el token."));
children.push(bullet("Agregar las env vars BRIGHTSPACE_SERVICE_REFRESH_TOKEN y CRON_SHARED_SECRET al taskdef."));

children.push(H2("16.3 Pendientes de largo plazo"));
children.push(bullet("Transferir el repositorio a una GitHub Organization de CESA para que quede del área, no de la persona."));
children.push(bullet("Considerar migrar a AWS IAM Identity Center (SSO) si CESA lo implementa."));
children.push(bullet("Si los costos de RDS suben con más usuarios, evaluar migrar a una instancia más grande o a Aurora Serverless."));
children.push(bullet("Implementar monitoreo y alertas (CloudWatch Alarms) para errores 5xx y caídas del backend."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 17. APÉNDICES ──
children.push(H1("17. Apéndices"));

children.push(H2("17.1 Flujo completo de un request"));
children.push(P("Para entender cómo viaja un request desde el navegador hasta la respuesta:"));
children.push(...codeBlock(`1. Usuario abre https://gemelo.cesa.edu.co
              ▼
2. CloudFront sirve index.html desde S3
              ▼
3. Browser carga el JS de React
              ▼
4. App detecta que no hay sesión → muestra LoginScreen
              ▼
5. Usuario click "Login Brightspace"
              ▼
6. Frontend redirige a /auth/brightspace/login (popup OAuth)
              ▼
7. Backend redirige a Brightspace OAuth + Microsoft SSO
              ▼
8. Usuario autentica en Microsoft
              ▼
9. Brightspace redirige a /auth/brightspace/callback con code
              ▼
10. Backend intercambia code por access_token + refresh_token
              ▼
11. Backend guarda sesión en SESSION_STORE
              ▼
12. Backend devuelve cookie gemelo_session_id al browser
              ▼
13. Frontend redirige a /dashboard
              ▼
14. Frontend hace GET /gemelo/course/{ou}/overview
              ▼
15. Backend chequea sesión, refresca token si necesario
              ▼
16. Backend lee desde Postgres (path rápido)
    o desde Brightspace (fallback si datos viejos)
              ▼
17. Backend devuelve JSON con métricas
              ▼
18. Frontend renderiza dashboard`));

children.push(H2("17.2 Glosario de términos"));
children.push(table2col([
  ["LTI 1.3", "Learning Tools Interoperability. Estándar para embeber herramientas externas en LMS."],
  ["Brightspace", "LMS desarrollado por D2L, usado por CESA."],
  ["orgUnitId", "Identificador único de un curso en Brightspace (ej. 41742)."],
  ["OAuth 2.0", "Protocolo de autorización. Flujo usado: Authorization Code."],
  ["ECS Fargate", "Servicio de containers serverless de AWS (no manejas servers)."],
  ["OIDC", "OpenID Connect. Usado por GitHub Actions para autenticarse con AWS sin Access Keys."],
  ["Snapshot", "Registro consolidado de métricas de un estudiante en un curso en un momento dado."],
  ["Gemelo Digital", "Representación virtual del progreso académico de un estudiante. Nombre del proyecto."],
  ["DXA", "Document XML Architecture units. 1440 DXA = 1 pulgada en formato DOCX."],
  ["Taskdef", "Task Definition de ECS. Define qué imagen, qué env vars, qué CPU/memoria usa el container."],
  ["Revision", "Versión del taskdef. Cada vez que cambias algo se crea una revisión nueva."],
  ["IAM Role", "Rol de identidad en AWS. Define qué permisos tiene quien lo asume."],
  ["SHA del commit", "Hash único que identifica un commit en git (ej. be945ab)."],
]));

children.push(H2("17.3 Lista de archivos importantes en el repo"));
children.push(table2col([
  ["docs/PROYECTO-GEMELO-DIGITAL-COMPLETO.md", "Versión Markdown de este documento"],
  ["docs/setup-scheduler.md", "Guía para configurar el scheduler en AWS"],
  ["gemelo-digital-backend/main.py", "Entry point del backend FastAPI"],
  ["gemelo-digital-backend/Dockerfile", "Definición de la imagen Docker"],
  ["gemelo-digital-backend/start.sh", "Script que corre migraciones antes de uvicorn"],
  ["gemelo-digital-backend/requirements.txt", "Dependencias Python"],
  ["gemelo-digital-backend/alembic.ini", "Configuración de Alembic"],
  ["gemelo-digital-backend/alembic/versions/", "Migraciones de la base de datos"],
  ["gemelo-digital-backend/app/db/models.py", "Schema de tablas (SQLAlchemy)"],
  ["gemelo-digital-backend/app/services/", "Lógica de negocio modular"],
  ["gemelo-digital-frontend/gemelo-frontend/package.json", "Dependencias y scripts del frontend"],
  ["gemelo-digital-frontend/gemelo-frontend/vite.config.js", "Configuración del bundler Vite"],
  ["gemelo-digital-frontend/gemelo-frontend/src/App.jsx", "Componente raíz del SPA"],
  ["gemelo-digital-frontend/gemelo-frontend/src/components/", "Componentes React reutilizables"],
  ["gemelo-digital-frontend/gemelo-frontend/src/context/", "Contextos React globales"],
  ["gemelo-digital-frontend/gemelo-frontend/src/pages/", "Pantallas principales"],
  ["gemelo-digital-frontend/gemelo-frontend/src/hooks/", "Hooks personalizados"],
  [".github/workflows/deploy-backend.yml", "Workflow CI/CD del backend"],
  [".github/workflows/deploy-frontend.yml", "Workflow CI/CD del frontend"],
  [".gitignore", "Archivos a ignorar por git"],
]));

children.push(divider());
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 400 },
  children: [new TextRun({ text: "Fin del documento", italics: true })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200 },
  children: [new TextRun({ text: "Última actualización: junio 2026", italics: true, size: 18 })],
}));

// ─────────────────────────────────────────────────────────
// Configuración del documento y export
// ─────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Claude (asistente del proyecto Gemelo Digital)",
  title: "Documentación maestra de Gemelo Digital CESA",
  description: "Documento consolidado del estado, infraestructura y operación del proyecto Gemelo Digital",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Calibri", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Calibri", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: "2E75B6" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
      {
        id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Calibri", color: "404040" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 3 },
      },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        { level: 2, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
      ],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "Gemelo Digital CESA — Documentación maestra",
            size: 18, color: "808080", italics: true,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Página ", size: 18, color: "808080" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" }),
            new TextRun({ text: " de ", size: 18, color: "808080" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "808080" }),
          ],
        })],
      }),
    },
    children: children,
  }],
});

// Guardar
const outputPath = path.join(__dirname, "..", "Gemelo-Digital-Documentacion-Completa.docx");

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log("OK - Generado:", outputPath);
  console.log("Tamaño:", (buffer.length / 1024).toFixed(1), "KB");
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
