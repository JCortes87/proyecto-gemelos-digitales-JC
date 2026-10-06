const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/RoleHome-C64crp2F.js","assets/rolldown-runtime-hePW80VL.js","assets/vendor-react-CIfdDtQn.js","assets/users-CIZJlbdo.js","assets/presentation-D-ZlcZms.js","assets/send-DOVfwYU4.js","assets/target-BqL6xDaT.js","assets/trending-up-CvVqf-uj.js","assets/roles-CpaltDPz.js","assets/TeacherDashboard-VEqo5Xni.js","assets/vendor-recharts-Ds17KAUD.js","assets/colors-DkAJyhwZ.js","assets/export-Dohdfu_4.js","assets/Breadcrumb-OLPtB-vd.js","assets/useDialogA11y-Cpow2lFg.js","assets/Dialog-HyOzQ4Ee.js","assets/DueDateCalendar-XG2aI1WE.js","assets/StudentPortal-2iKketPX.js","assets/CoordinatorDashboard-M7u93anv.js","assets/LearningOutcomesAdmin-DT7AHw-T.js","assets/refresh-cw-btTk44q-.js","assets/AdminPanel--k0YB9Yf.js"])))=>i.map(i=>d[i]);
import{r as e}from"./rolldown-runtime-hePW80VL.js";import{a as t,c as n,d as r,i,l as a,n as o,r as s,t as c}from"./vendor-react-CIfdDtQn.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var l=e(r(),1),u=a(),d=(0,l.createContext)(null);function f(){let e=(0,l.useContext)(d);if(!e)throw Error(`useAuth must be used within AuthProvider`);return e}var p=`https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws`.replace(/\/$/,``);p||console.error(`⚠️ Falta definir VITE_API_BASE_URL (o VITE_GEMELO_BASE_URL) en el .env`);function m(e){return p?`${p}${e}`:e}var h=`gemelo_sid`;function g(){try{return typeof localStorage<`u`?localStorage.getItem(h):null}catch{return null}}function _(e){try{e&&localStorage.setItem(h,e)}catch{}}function ee(){try{localStorage.removeItem(h)}catch{}}function v(e=g()){return e?{Authorization:`Bearer ${e}`}:{}}var y=`gemelo:unauthorized`;function b(e){ee();try{window.dispatchEvent(new CustomEvent(y,{detail:e}))}catch{}}function te(e){let t=t=>e(t.detail);return window.addEventListener(y,t),()=>window.removeEventListener(y,t)}var x=class extends Error{constructor(e,t,n){super(e),this.name=`ApiError`,this.status=t,this.body=n}};function ne(e){let t=e.headers.get(`content-type`)||``;return t.includes(`application/json`)||t.includes(`application/problem+json`)}async function re(e,t=`descarga`){let n=g(),r=await fetch(m(e),{method:`GET`,credentials:`include`,headers:v(n)});if(!r.ok){let t=await r.text().catch(()=>``);throw r.status===401&&n&&b({path:e,status:401}),new x(`HTTP ${r.status} - ${String(t).slice(0,300)}`,r.status,t)}let i=r.headers.get(`content-disposition`)||``,a=/filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(i),o=a?decodeURIComponent(a[1].replace(/"/g,``).trim()):t,s=await r.blob(),c=URL.createObjectURL(s),l=document.createElement(`a`);l.href=c,l.download=o,document.body.appendChild(l),l.click(),l.remove(),setTimeout(()=>URL.revokeObjectURL(c),4e3)}var ie=new Set([502,503,504]),S=[500,1500];function ae(e,t){return new Promise((n,r)=>{if(t?.aborted){r(new DOMException(`Aborted`,`AbortError`));return}let i=setTimeout(n,e);t?.addEventListener(`abort`,()=>{clearTimeout(i),r(new DOMException(`Aborted`,`AbortError`))},{once:!0})})}async function oe(e,t){let n=null;for(let r=0;r<=S.length;r++){r>0&&await ae(S[r-1],t.signal);try{let i=await fetch(e,t);if(ie.has(i.status)&&r<S.length){n=Error(`HTTP ${i.status}`);continue}return i}catch(e){if(e?.name===`AbortError`||(n=e,r>=S.length))throw e}}throw n||Error(`Fallo de red`)}async function C(e,t,{body:n,headers:r,signal:i}={}){let a=e===`GET`,o=g(),s={method:e,credentials:`include`,headers:{Accept:`application/json`,...a?{}:{"Content-Type":`application/json`},...v(o),...r||{}},signal:i};a||(s.body=n==null?void 0:JSON.stringify(n));let c=a?await oe(m(t),s):await fetch(m(t),s),l=ne(c);if(!c.ok){let e=l?await c.json().catch(()=>({})):await c.text().catch(()=>``),n=typeof e==`string`?e:e?.detail||e?.message||e?.error||JSON.stringify(e);throw c.status===401&&o&&b({path:t,status:401}),new x(`HTTP ${c.status} - ${String(n).slice(0,600)}`,c.status,e)}if(a){if(!l){let e=c.headers.get(`content-type`)||``,t=await c.text().catch(()=>``);throw Error(`Respuesta no JSON (${e}): ${t.slice(0,300)}`)}return c.json()}return l?c.json():c.text()}async function w(e,t={}){return C(`GET`,e,{headers:t.headers,signal:t.signal})}async function se(e,t,n={}){return C(`POST`,e,{body:t,headers:n.headers,signal:n.signal})}async function ce(e,t,n={}){return C(`PUT`,e,{body:t,headers:n.headers,signal:n.signal})}var T=new Map,E=new Map,le=6e4;async function ue(e,t={}){let{signal:n,...r}=t,i=t.ttl??le,a=Date.now(),o=null;if(!t.force){let t=T.get(e);if(t&&a-t.ts<i)return t.data;o=E.get(e)||null}return o||(o=w(e,r).then(t=>(T.set(e,{ts:Date.now(),data:t}),t)).finally(()=>{E.delete(e)}),E.set(e,o)),n?new Promise((e,t)=>{let r=()=>{try{return new DOMException(`Aborted`,`AbortError`)}catch{return Object.assign(Error(`Aborted`),{name:`AbortError`})}};if(n.aborted){t(r());return}let i=()=>t(r());n.addEventListener(`abort`,i,{once:!0}),o.then(t=>{n.removeEventListener(`abort`,i),e(t)},e=>{n.removeEventListener(`abort`,i),t(e)})}):o}function de(e=``){for(let t of T.keys())t.startsWith(e)&&T.delete(t)}async function fe(e,t,n){let r=Array.isArray(e)?e:[],i=Array(r.length),a=0,o=Array(Math.min(t,r.length)).fill(null).map(async()=>{for(;a<r.length;){let e=a++;i[e]=await n(r[e],e)}});return await Promise.all(o),i}var D=c(),pe=new Set([`instructor`,`coordinador administrativo`,`super administrator`]),me=new Set([`estudiante ef`]);function O(e){if(!e)return null;let t=String(e).toLowerCase().trim();return me.has(t)||t.includes(`estudiante`)||t.includes(`student`)?`student`:pe.has(t)||t.includes(`instructor`)||t.includes(`admin`)||t.includes(`coordinador`)?`instructor`:(console.warn(`[AuthContext] Rol desconocido de Brightspace: "${e}" — asignando "student" (fail-closed)`),`student`)}function he(e){if(!Array.isArray(e)||!e.length)return[`student`];let t=new Set;for(let n of e){let e=O(n);e&&t.add(e)}return t.size>0?Array.from(t):[`student`]}function ge({children:e}){let[t,n]=(0,l.useState)(null),[r,i]=(0,l.useState)(!1),[a,o]=(0,l.useState)(!1),[s,c]=(0,l.useState)(null);(0,l.useEffect)(()=>{(async()=>{try{let e=null,t=null,r=window.location.hash;if(r.startsWith(`#gemelo:`)){let n=r.slice(1).split(`:`);if(n.length>=2&&(e=n[1]||null,t=n[2]&&Number(n[2])>0?Number(n[2]):null,n[3]===`1`&&sessionStorage.setItem(`gemelo_first_login`,`1`)),window.history.replaceState(null,``,window.location.pathname+window.location.search),e&&window.opener&&!window.opener.closed){try{window.opener.postMessage({type:`gemelo-auth`,sid:e,orgUnitId:t,firstLogin:n[3]===`1`},window.location.origin)}catch{}setTimeout(()=>window.close(),300);return}}e||=g(),e&&(_(e),localStorage.removeItem(`gemelo_oauth_pending`)),t&&(c(t),sessionStorage.setItem(`gemelo_lti_org`,String(t)),sessionStorage.setItem(`gemelo_pending_org`,String(t)));let i=await(await fetch(m(`/auth/me`),{credentials:`include`,headers:v(e)})).json();if(i.authenticated){let t=i.all_roles||(i.role?[i.role]:[]);try{let n=await fetch(m(`/brightspace/courses/enrolled?active_only=false&limit=200`),{credentials:`include`,headers:v(e)});if(n.ok){let e=await n.json(),r=Array.isArray(e?.items)?e.items:[],i=[...new Set(r.map(e=>String(e.roleName||``).trim()).filter(e=>e))];i.length>0&&(t=[...new Set([...t,...i])])}}catch{}let r=he(t),a=O(i.role)||r[0],s=`5427`.split(`,`).map(e=>e.trim()).filter(Boolean),l=String(i.role||``).trim().toLowerCase(),u=s.includes(String(i.user_id))||t.some(e=>String(e).toLowerCase().includes(`super admin`))||t.some(e=>String(e).trim().toLowerCase()===`administrator`)||l.includes(`super admin`)||l===`administrator`,d={...i,all_roles:t,appRole:a,appRoles:r,isDualRole:r.length>1,isInstructor:r.includes(`instructor`),isStudent:r.includes(`student`),isSuperAdmin:u};n(d);let f=sessionStorage.getItem(`gemelo_pending_org`);f&&Number(f)>0&&c(Number(f)),sessionStorage.removeItem(`gemelo_first_login`),localStorage.getItem(`gemelo_onboarded`)!==`1`&&o(!0)}else if(i.lti_detected){let e=i.org_unit_id||``;e&&sessionStorage.setItem(`gemelo_pending_org`,e);let t=m(e?`/auth/brightspace/login?org_unit_id=${e}`:`/auth/brightspace/login`);window.location.href=t;return}}catch{}finally{i(!0)}})()},[]);let u=(0,l.useRef)(!1),f=(0,l.useCallback)(()=>{ee(),sessionStorage.clear(),!u.current&&(u.current=!0,window.location.href=window.location.origin+`/`)},[]),p=(0,l.useCallback)(async()=>{try{await fetch(m(`/auth/logout`),{method:`POST`,credentials:`include`,headers:v()})}catch{}f()},[f]);(0,l.useEffect)(()=>te(()=>f()),[f]);let h=(0,l.useMemo)(()=>({authUser:t,authChecked:r,role:t?.appRole||`student`,allRoles:t?.appRoles||[`student`],isDualRole:t?.isDualRole||!1,isInstructor:t?.isInstructor??!1,isStudent:t?.isStudent??!1,isSuperAdmin:t?.isSuperAdmin??!1,logout:p,showTutorial:a,setShowTutorial:o,initialOrgUnitId:s}),[t,r,p,a,s]);return(0,D.jsx)(d.Provider,{value:h,children:e})}var k=(0,l.createContext)(null);function _e(){let e=(0,l.useContext)(k);if(!e)throw Error(`useTheme must be used within ThemeProvider`);return e}function ve({children:e}){let[t,n]=(0,l.useState)(()=>typeof window>`u`?!1:localStorage.getItem(`gemelo_dark`)===`1`);(0,l.useEffect)(()=>{document.documentElement.classList.toggle(`dark`,t),localStorage.setItem(`gemelo_dark`,t?`1`:`0`)},[t]);let r=(0,l.useCallback)(()=>n(e=>!e),[]),i=(0,l.useMemo)(()=>({darkMode:t,setDarkMode:n,toggleDark:r}),[t,r]);return(0,D.jsx)(k.Provider,{value:i,children:e})}var ye=(0,l.createContext)(null),A=(...e)=>e.filter((e,t,n)=>!!e&&e.trim()!==``&&n.indexOf(e)===t).join(` `).trim(),be=e=>e.replace(/([a-z0-9])([A-Z])/g,`$1-$2`).toLowerCase(),xe=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,t,n)=>n?n.toUpperCase():t.toLowerCase()),j=e=>{let t=xe(e);return t.charAt(0).toUpperCase()+t.slice(1)},M={xmlns:`http://www.w3.org/2000/svg`,width:24,height:24,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:2,strokeLinecap:`round`,strokeLinejoin:`round`},Se=e=>{for(let t in e)if(t.startsWith(`aria-`)||t===`role`||t===`title`)return!0;return!1},Ce=(0,l.createContext)({}),we=()=>(0,l.useContext)(Ce),Te=(0,l.forwardRef)(({color:e,size:t,strokeWidth:n,absoluteStrokeWidth:r,className:i=``,children:a,iconNode:o,...s},c)=>{let{size:u=24,strokeWidth:d=2,absoluteStrokeWidth:f=!1,color:p=`currentColor`,className:m=``}=we()??{},h=r??f?Number(n??d)*24/Number(t??u):n??d;return(0,l.createElement)(`svg`,{ref:c,...M,width:t??u??M.width,height:t??u??M.height,stroke:e??p,strokeWidth:h,className:A(`lucide`,m,i),...!a&&!Se(s)&&{"aria-hidden":`true`},...s},[...o.map(([e,t])=>(0,l.createElement)(e,t)),...Array.isArray(a)?a:[a]])}),N=(e,t)=>{let n=(0,l.forwardRef)(({className:n,...r},i)=>(0,l.createElement)(Te,{ref:i,iconNode:t,className:A(`lucide-${be(j(e))}`,`lucide-${e}`,n),...r}));return n.displayName=j(e),n},Ee=N(`check`,[[`path`,{d:`M20 6 9 17l-5-5`,key:`1gmf2c`}]]),P=N(`circle-check`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`m9 12 2 2 4-4`,key:`dzmm74`}]]),F=N(`circle-x`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`m15 9-6 6`,key:`1uzhvr`}],[`path`,{d:`m9 9 6 6`,key:`z0biqf`}]]),I=N(`clock`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`M12 6v6l4 2`,key:`mmk7yg`}]]),De=N(`copy`,[[`rect`,{width:`14`,height:`14`,x:`8`,y:`8`,rx:`2`,ry:`2`,key:`17jyea`}],[`path`,{d:`M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2`,key:`zix9uf`}]]),Oe=N(`house`,[[`path`,{d:`M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8`,key:`5wwlr5`}],[`path`,{d:`M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z`,key:`r6nss1`}]]),L=N(`info`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`M12 16v-4`,key:`1dtifu`}],[`path`,{d:`M12 8h.01`,key:`e9boi3`}]]),R=N(`loader-circle`,[[`path`,{d:`M21 12a9 9 0 1 1-6.219-8.56`,key:`13zald`}]]),z=N(`rotate-ccw`,[[`path`,{d:`M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8`,key:`1357e3`}],[`path`,{d:`M3 3v5h5`,key:`1xhq8a`}]]),B=N(`triangle-alert`,[[`path`,{d:`m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3`,key:`wmoenq`}],[`path`,{d:`M12 9v4`,key:`juzpu7`}],[`path`,{d:`M12 17h.01`,key:`p32p05`}]]),V=N(`x`,[[`path`,{d:`M18 6 6 18`,key:`1bl5f8`}],[`path`,{d:`m6 6 12 12`,key:`d8bk6v`}]]),H={info:{fg:`var(--brand, #0B5FFF)`,bg:`var(--brand-light, #EBF1FF)`,border:`var(--brand, #0B5FFF)`,Icon:L,label:`Información`},success:{fg:`var(--ok, #12B76A)`,bg:`var(--ok-bg, #ECFDF3)`,border:`var(--ok-border, #A9EFC5)`,Icon:P,label:`Éxito`},warning:{fg:`var(--watch, #E8900A)`,bg:`var(--watch-bg, #FFF8ED)`,border:`var(--watch-border, #FCD385)`,Icon:B,label:`Advertencia`},critical:{fg:`var(--critical, #D92D20)`,bg:`var(--critical-bg, #FEF3F2)`,border:`var(--critical-border, #FDA29B)`,Icon:F,label:`Crítico`},pending:{fg:`var(--pending, #8B96A8)`,bg:`var(--pending-bg, #F1F3F7)`,border:`var(--pending-border, #D1D8E4)`,Icon:I,label:`Pendiente`},neutral:{fg:`var(--muted-strong, #3D465C)`,bg:`var(--bg, #F2F4F8)`,border:`var(--border, #E4E8EF)`,Icon:L,label:`Neutral`}};function ke(e=`neutral`){return H[e]||H.neutral}function Ae(e){if(!e)return`neutral`;let t=String(e).toLowerCase().trim();return t===`error`||t===`danger`||t===`risk`?`critical`:t===`ok`||t===`green`?`success`:t===`watch`||t===`yellow`?`warning`:t===`blue`||t===`brand`?`info`:t===`gray`||t===`grey`||t===`muted`?`pending`:H[t]?t:`neutral`}var je={info:`info`,success:`success`,warning:`warning`,error:`critical`},Me=0;function Ne({children:e}){let[t,n]=(0,l.useState)([]),r=(0,l.useCallback)((e,{type:t=`info`,duration:r=5e3}={})=>{let i=++Me;return n(n=>[...n,{id:i,message:e,type:t,duration:r}]),i},[]),i=(0,l.useCallback)(e=>{n(t=>t.filter(t=>t.id!==e))},[]),a=(0,l.useMemo)(()=>({info:(e,t)=>r(e,{...t,type:`info`}),success:(e,t)=>r(e,{...t,type:`success`}),warning:(e,t)=>r(e,{...t,type:`warning`}),error:(e,t)=>r(e,{...t,type:`error`,duration:t?.duration||8e3})}),[r]);return(0,D.jsxs)(ye.Provider,{value:a,children:[e,(0,D.jsx)(Fe,{toasts:t,onRemove:i})]})}function Pe({toast:e,onRemove:t}){let n=Ae(je[e.type]||e.type),r=ke(n),i=r.Icon;return(0,l.useEffect)(()=>{if(e.duration>0){let n=setTimeout(()=>t(e.id),e.duration);return()=>clearTimeout(n)}},[e.id,e.duration,t]),(0,D.jsxs)(`div`,{role:n===`critical`||n===`warning`?`alert`:`status`,style:{display:`flex`,alignItems:`center`,gap:10,padding:`10px 16px`,borderRadius:12,background:r.bg,border:`1px solid ${r.border}`,color:r.fg,fontSize:13,fontWeight:600,fontFamily:`'Manrope', system-ui, sans-serif`,boxShadow:`0 4px 16px rgba(0,0,0,0.1)`,animation:`fadeUp 0.3s ease both`,maxWidth:420,wordBreak:`break-word`},children:[(0,D.jsx)(i,{size:18,strokeWidth:2.2,style:{flexShrink:0},"aria-hidden":`true`}),(0,D.jsx)(`span`,{style:{flex:1},children:e.message}),(0,D.jsx)(`button`,{onClick:()=>t(e.id),"aria-label":`Cerrar`,style:{background:`none`,border:`none`,cursor:`pointer`,color:r.fg,opacity:.6,padding:`2px 4px`,flexShrink:0,display:`flex`,alignItems:`center`},children:(0,D.jsx)(V,{size:14,strokeWidth:2.5,"aria-hidden":`true`})})]})}function Fe({toasts:e,onRemove:t}){return(0,D.jsx)(`div`,{role:`region`,"aria-label":`Notificaciones`,"aria-live":`polite`,"aria-atomic":`false`,style:{position:`fixed`,top:16,right:16,zIndex:99999,display:`flex`,flexDirection:`column`,gap:8,pointerEvents:e.length?`auto`:`none`},children:e.map(e=>(0,D.jsx)(Pe,{toast:e,onRemove:t},e.id))})}var U=(0,l.createContext)(null);function Ie(){return(0,l.useContext)(U)||{locale:`es`,t:(e,t)=>t||e,setLocale:()=>{},toggleLocale:()=>{}}}var W={es:{"common.loading":`Cargando...`,"common.error":`Error`,"common.retry":`Reintentar`,"common.cancel":`Cancelar`,"common.save":`Guardar`,"common.close":`Cerrar`,"common.search":`Buscar`,"common.export":`Exportar`,"common.print":`Imprimir`,"common.logout":`Cerrar sesión`,"dashboard.title":`Visor de desempeño estudiantil · Vista Docente`,"dashboard.students":`Estudiantes`,"dashboard.courseManagement":`Gestión del curso`,"dashboard.riskAcademic":`Riesgo académico`,"dashboard.priorityAcademic":`Prioridad académica`,"dashboard.priorityStudents":`Estudiantes prioritarios`,"dashboard.gradeDistribution":`Distribución de calificaciones`,"dashboard.trends":`Tendencias del curso`,"dashboard.smartAlerts":`Alertas inteligentes`,"dashboard.dueDateCalendar":`Calendario de entregas`,"dashboard.myCourses":`Mis cursos`,"dashboard.noCourse":`Selecciona un curso`,"nav.dashboard":`Dashboard`,"nav.students":`Estudiantes`,"nav.calendar":`Calendario`,"nav.trends":`Tendencias`,"nav.routes":`Rutas de atención`,"nav.predictions":`Predicción de calificaciones`,"nav.evidences":`Evidencias`,"nav.learningOutcomes":`Resultados de aprendizaje`,"nav.assistant":`Asistente IA`,"nav.support":`Soporte`,"nav.views":`Vistas`,"nav.activeCourse":`Curso activo`,"nav.teacherView":`Vista Docente`,"topbar.courseIdPlaceholder":`ID de curso…`,"topbar.commands":`Comandos`,"topbar.home":`Inicio`,"topbar.myCourses":`Mis cursos`,"topbar.viewAs":`Ver como...`,"topbar.teacherView":`Vista profesor`,"topbar.studentView":`Vista estudiante`,"topbar.coordination":`Panel de coordinación`,"topbar.language":`Idioma`,"topbar.lightMode":`Tema claro`,"topbar.darkMode":`Tema oscuro`,"topbar.print":`Imprimir vista`,"portal.title":`Visor de desempeño estudiantil · Mi Rendimiento`,"portal.greeting":`Hola`,"portal.myGrade":`Mi Nota Actual`,"portal.coverage":`Cobertura`,"portal.myStatus":`Mi Estado`,"portal.myRoute":`Mi Ruta de Mejora`,"portal.myLearningOutcomes":`Mis Resultados de Aprendizaje`,"portal.myEvidences":`Mis Evidencias Calificadas`,"portal.overdueDeliveries":`Entregas Vencidas`,"portal.pendingDeliveries":`Entregas Pendientes`},en:{"common.loading":`Loading...`,"common.error":`Error`,"common.retry":`Retry`,"common.cancel":`Cancel`,"common.save":`Save`,"common.close":`Close`,"common.search":`Search`,"common.export":`Export`,"common.print":`Print`,"common.logout":`Sign out`,"dashboard.title":`Digital Twin · Teacher View`,"dashboard.students":`Students`,"dashboard.courseManagement":`Course Management`,"dashboard.riskAcademic":`Academic Risk`,"dashboard.priorityAcademic":`Academic Priority`,"dashboard.priorityStudents":`Priority Students`,"dashboard.gradeDistribution":`Grade Distribution`,"dashboard.trends":`Course Trends`,"dashboard.smartAlerts":`Smart Alerts`,"dashboard.dueDateCalendar":`Due Date Calendar`,"dashboard.myCourses":`My Courses`,"dashboard.noCourse":`Select a course`,"nav.dashboard":`Dashboard`,"nav.students":`Students`,"nav.calendar":`Calendar`,"nav.trends":`Trends`,"nav.routes":`Intervention Routes`,"nav.predictions":`Grade Predictions`,"nav.evidences":`Evidences`,"nav.learningOutcomes":`Learning Outcomes`,"nav.assistant":`AI Assistant`,"nav.support":`Support`,"nav.views":`Views`,"nav.activeCourse":`Active course`,"nav.teacherView":`Teacher View`,"topbar.courseIdPlaceholder":`Course ID…`,"topbar.commands":`Commands`,"topbar.home":`Home`,"topbar.myCourses":`My Courses`,"topbar.viewAs":`View as...`,"topbar.teacherView":`Teacher view`,"topbar.studentView":`Student view`,"topbar.coordination":`Coordination panel`,"topbar.language":`Language`,"topbar.lightMode":`Light theme`,"topbar.darkMode":`Dark theme`,"topbar.print":`Print view`,"portal.title":`Digital Twin · My Performance`,"portal.greeting":`Hi`,"portal.myGrade":`My Current Grade`,"portal.coverage":`Coverage`,"portal.myStatus":`My Status`,"portal.myRoute":`My Improvement Path`,"portal.myLearningOutcomes":`My Learning Outcomes`,"portal.myEvidences":`My Graded Evidences`,"portal.overdueDeliveries":`Overdue Deliveries`,"portal.pendingDeliveries":`Pending Deliveries`}},Le=`es`;function Re({children:e}){let[t,n]=(0,l.useState)(Le);(0,l.useEffect)(()=>{try{localStorage.setItem(`gemelo_locale`,t)}catch{}typeof document<`u`&&(document.documentElement.lang=t)},[t]);let r=(0,l.useCallback)((e,n)=>(W[t]||W.es)[e]||n||e,[t]),i=(0,l.useCallback)(e=>{W[e]&&n(e)},[]),a=(0,l.useCallback)(()=>{n(e=>e===`es`?`en`:`es`)},[]),o=(0,l.useMemo)(()=>({locale:t,t:r,setLocale:i,toggleLocale:a}),[t,r,i,a]);return(0,D.jsx)(U.Provider,{value:o,children:e})}var G=`gemelo_last_crash`,K=class extends l.Component{constructor(e){super(e),this.state={hasError:!1,error:null,copied:!1}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error(`[ErrorBoundary]`,e,t);try{let n={section:this.props.sectionName||`app`,message:String(e?.message||e),stack:String(e?.stack||``),componentStack:String(t?.componentStack||``),url:typeof window<`u`?window.location.href:``,at:new Date().toISOString()};sessionStorage.setItem(G,JSON.stringify(n))}catch{}try{window.__gemeloSentry?.captureException(e,{contexts:{react:{componentStack:String(t?.componentStack||``)}},tags:{section:this.props.sectionName||`app`}})}catch{}}handleRetry=()=>{let e=String(this.state.error?.message||``);if(/dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(e)){window.location.reload();return}this.setState({hasError:!1,error:null,copied:!1})};handleGoHome=()=>{try{sessionStorage.removeItem(G)}catch{}window.location.href=`/`};handleCopy=async()=>{try{let e=sessionStorage.getItem(G)||JSON.stringify({message:String(this.state.error?.message||this.state.error),section:this.props.sectionName||`app`});await navigator.clipboard.writeText(e),this.setState({copied:!0}),setTimeout(()=>this.setState({copied:!1}),2e3)}catch{}};render(){if(this.state.hasError){let{fallback:e,sectionName:t}=this.props;if(e)return e;let n={border:`none`,borderRadius:8,padding:`8px 14px`,fontSize:12,fontWeight:700,cursor:`pointer`,display:`inline-flex`,alignItems:`center`,gap:6,fontFamily:`'Manrope', system-ui, sans-serif`};return(0,D.jsxs)(`div`,{role:`alert`,"aria-live":`assertive`,style:{padding:`24px 20px`,border:`1px solid var(--critical-border, #FDA29B)`,borderRadius:16,background:`var(--critical-bg, #FEF3F2)`,textAlign:`center`,fontFamily:`'Manrope', system-ui, sans-serif`,maxWidth:520,margin:`24px auto`},children:[(0,D.jsx)(`div`,{style:{marginBottom:10,display:`flex`,justifyContent:`center`,color:`var(--critical, #d92d20)`},children:(0,D.jsx)(B,{size:30,strokeWidth:2,"aria-hidden":`true`})}),(0,D.jsx)(`div`,{style:{fontSize:14,fontWeight:800,color:`var(--text, #0F1827)`,marginBottom:6},children:t?`Error en ${t}`:`Algo salió mal`}),(0,D.jsx)(`div`,{style:{fontSize:12,color:`var(--muted-strong, #3D465C)`,marginBottom:16,lineHeight:1.5,wordBreak:`break-word`},children:this.state.error?.message||`Ocurrió un error inesperado.`}),(0,D.jsxs)(`div`,{style:{display:`flex`,gap:8,justifyContent:`center`,flexWrap:`wrap`},children:[(0,D.jsxs)(`button`,{type:`button`,onClick:this.handleRetry,style:{...n,background:`var(--brand, #0B5FFF)`,color:`var(--on-brand, #fff)`},children:[(0,D.jsx)(z,{size:14,strokeWidth:2.2,"aria-hidden":`true`}),`Reintentar`]}),(0,D.jsxs)(`button`,{type:`button`,onClick:this.handleGoHome,style:{...n,background:`var(--card, #fff)`,color:`var(--text, #0F1827)`,border:`1px solid var(--border, #E4E8EF)`},children:[(0,D.jsx)(Oe,{size:14,strokeWidth:2.2,"aria-hidden":`true`}),`Volver al inicio`]}),(0,D.jsx)(`button`,{type:`button`,onClick:this.handleCopy,title:`Copiar detalles del error para reporte a soporte`,style:{...n,background:`transparent`,color:`var(--muted-strong, #3D465C)`,border:`1px solid var(--border, #E4E8EF)`},children:this.state.copied?(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(Ee,{size:14,strokeWidth:2.4,"aria-hidden":`true`}),`Copiado`]}):(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(De,{size:14,strokeWidth:2.2,"aria-hidden":`true`}),`Copiar detalles`]})})]})]})}return this.props.children}};function q({children:e,allowedRoles:t}){let{authUser:n,authChecked:r,allRoles:i,isDualRole:a}=f();return r?n?t&&!i.some(e=>t.includes(e))?(0,D.jsx)(s,{to:a?`/`:i.includes(`student`)?`/portal`:`/dashboard`,replace:!0}):e:(0,D.jsx)(s,{to:`/login`,replace:!0}):(0,D.jsx)(`div`,{style:{minHeight:`100vh`,background:`var(--bg)`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Manrope', system-ui, sans-serif`},children:(0,D.jsxs)(`div`,{style:{background:`var(--card)`,border:`1px solid var(--border)`,borderRadius:24,padding:`40px 48px`,textAlign:`center`,boxShadow:`0 8px 32px rgba(15,24,39,0.12)`,minWidth:320,maxWidth:480},children:[(0,D.jsx)(`div`,{style:{fontSize:20,fontWeight:800,color:`var(--text)`},children:`CESA · Visor de desempeño estudiantil 2026.8.7`}),(0,D.jsx)(`div`,{style:{fontSize:13,color:`var(--muted)`,marginTop:4},children:`Verificando sesión...`})]})})}function J(){if(typeof document>`u`)return;let e=`gemelo-styles`;if(document.getElementById(e))return;let t=document.createElement(`style`);t.id=e,t.textContent=ze,document.head.appendChild(t)}var ze=`
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --sidebar-w: 220px;
    --bg: #F2F4F8;
    --bg2: #FAFBFD;
    --card: #FFFFFF;
    --border: #E4E8EF;
    --border2: #CDD3DE;
    --text: #0F1827;
    --muted: #5A6580;
    --muted-strong: #3D465C;
    --focus-ring: rgba(11,95,255,0.35);
    --brand: #0B5FFF;
    --brand-2: #003EA6;
    --brand-light: #EBF1FF;
    --brand-light2: #D6E4FF;
    --shadow: 0 1px 3px rgba(15,24,39,0.06), 0 4px 16px rgba(15,24,39,0.04);
    --shadow-md: 0 4px 12px rgba(15,24,39,0.08), 0 8px 24px rgba(15,24,39,0.06);
    --shadow-lg: 0 8px 32px rgba(15,24,39,0.12), 0 16px 48px rgba(15,24,39,0.08);
    --radius: 16px;
    --radius-lg: 24px;
    --font: 'Manrope', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --ok: #12B76A;
    --ok-bg: #ECFDF3;
    --ok-border: #A9EFC5;
    --watch: #E8900A;
    --watch-bg: #FFF8ED;
    --watch-border: #FCD385;
    --critical: #D92D20;
    --critical-bg: #FEF3F2;
    --critical-border: #FDA29B;
    --pending: #8B96A8;
    --pending-bg: #F1F3F7;
    --pending-border: #D1D8E4;
    /* Tokens semánticos para estilos inline (sustituyen hex hard-coded).
       El valor light conserva el color exacto que se usaba antes. */
    --ok-fg: #1B5E20;          /* texto sobre --ok-bg */
    --watch-fg: #9A3412;       /* texto sobre --watch-bg */
    --critical-fg: #B42318;    /* texto sobre --critical-bg */
    --info-fg: #1E40AF;        /* texto informativo (azul oscuro) */
    --info-bg: rgba(37,99,235,0.08);
    --info-border: rgba(37,99,235,0.25);
    --success-fg: #059669;
    --success-bg: rgba(16,185,129,0.1);
    --success-border: rgba(16,185,129,0.3);
    --warning-fg: #B45309;
    --warning-bg: rgba(245,158,11,0.1);
    --warning-border: rgba(245,158,11,0.3);
    --danger-fg: #DC2626;
    --danger-bg: rgba(220,38,38,0.08);
    --danger-border: rgba(220,38,38,0.3);
    --brand-border: rgba(11,95,255,0.3);
    --surface-muted: #F5F7FB;
    --accent-fg: #7C3AED;      /* violeta: etiquetas/acentos secundarios */
    --on-brand: #FFFFFF;       /* texto sobre fondos de marca */
    --on-status: #FFFFFF;      /* texto sobre rellenos sólidos de estado (ok/watch/critical/danger) */
    --overlay: rgba(13,17,23,0.65);
    /* Typography scale — opt-in tokens (progressive migration) */
    --text-xs: 10px;
    --text-sm: 11px;
    --text-base: 12px;
    --text-md: 13px;
    --text-lg: 15px;
    --text-xl: 18px;
    --text-2xl: 22px;
    --text-3xl: 28px;
    --leading-tight: 1.25;
    --leading-normal: 1.5;
    --leading-relaxed: 1.65;
    --font-weight-regular: 500;
    --font-weight-medium: 600;
    --font-weight-semibold: 700;
    --font-weight-bold: 800;
    --font-weight-black: 900;
  }

  .dark {
    --bg: #0B1120;
    --bg2: #101828;
    --card: #1A2332;
    --border: #2D3B4F;
    --border2: #3D4F66;
    --text: #F1F5FB;
    --muted: #94A3BB;
    --muted-strong: #C6D2E2;
    --focus-ring: rgba(96,165,250,0.55);
    --brand: #3B82F6;
    --brand-light: #172554;
    --brand-light2: #1E3A5F;
    --shadow: 0 1px 4px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.35);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.65);
    --ok: #34D399;
    --ok-bg: #0D2818;
    --ok-border: #166534;
    --watch: #FBBF24;
    --watch-bg: #27200A;
    --watch-border: #854D0E;
    --critical: #F87171;
    --critical-bg: #2A0F0F;
    --critical-border: #991B1B;
    --pending-bg: #1A2332;
    --pending-border: #2D3B4F;
    /* Tokens semánticos — contraste ≥4.5:1 sobre --card/--bg oscuros */
    --ok-fg: #6EE7B7;
    --watch-fg: #FCD34D;
    --critical-fg: #FCA5A5;
    --info-fg: #93C5FD;
    --info-bg: rgba(96,165,250,0.12);
    --info-border: rgba(96,165,250,0.35);
    --success-fg: #34D399;
    --success-bg: rgba(52,211,153,0.12);
    --success-border: rgba(52,211,153,0.35);
    --warning-fg: #FBBF24;
    --warning-bg: rgba(251,191,36,0.12);
    --warning-border: rgba(251,191,36,0.35);
    --danger-fg: #F87171;
    --danger-bg: rgba(248,113,113,0.12);
    --danger-border: rgba(248,113,113,0.35);
    --brand-border: rgba(96,165,250,0.4);
    --surface-muted: #131C2A;
    --accent-fg: #C4B5FD;
    --on-brand: #FFFFFF;
    --on-status: #0B1120;
    --overlay: rgba(0,0,0,0.7);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv11", "ss01";
  }

  .app-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0;
    width: var(--sidebar-w); background: var(--card);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; z-index: 100;
    transition: transform 0.28s cubic-bezier(.4,0,.2,1);
  }
  .app-sidebar.collapsed { transform: translateX(calc(-1 * var(--sidebar-w))); }
  .app-topbar.sidebar-collapsed { left: 0; }
  .sidebar-logo { padding: 22px 20px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .sidebar-logo-icon { width: 36px; height: 36px; background: var(--brand); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 900; letter-spacing: -0.05em; flex-shrink: 0; }
  .sidebar-logo-text { line-height: 1.2; }
  .sidebar-logo-name { font-size: 12px; font-weight: 800; color: var(--text); letter-spacing: 0.02em; }
  .sidebar-logo-sub { font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  .sidebar-nav { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .sidebar-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 8px 10px 4px; margin-top: 8px; }
  .sidebar-nav-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; }
  .sidebar-nav-item:hover { background: var(--bg); color: var(--text); }
  .sidebar-nav-item.active { background: var(--brand-light); color: var(--brand); }
  .sidebar-nav-item.active .snav-icon { color: var(--brand); }
  .sidebar-nav-dot { width: 5px; height: 5px; border-radius: 50%; background: transparent; transition: background 0.15s; flex-shrink: 0; margin-left: auto; }
  .sidebar-nav-item.active .sidebar-nav-dot { background: var(--brand); }
  .snav-icon { font-size: 16px; flex-shrink: 0; }
  .sidebar-footer { padding: 12px 10px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
  .sidebar-course-pill { padding: 10px 12px; border-radius: 10px; background: var(--brand-light); margin-bottom: 8px; }
  .sidebar-course-label { font-size: 9px; font-weight: 800; color: var(--brand); text-transform: uppercase; letter-spacing: 0.1em; }
  .sidebar-course-name { font-size: 11px; font-weight: 700; color: var(--text); margin-top: 2px; line-height: 1.3; }

  .app-topbar { position: fixed; left: var(--sidebar-w); right: 0; top: 0; height: 56px; background: rgba(255,255,255,0.9); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px 0 20px; z-index: 50; transition: left 0.28s cubic-bezier(.4,0,.2,1); }
  .dark .app-topbar { background: rgba(26,35,50,0.92); }
  .dark .app-sidebar { background: var(--card); border-color: var(--border); }
  .dark .kpi-card { border-color: var(--border); }
  .dark .tr-hover:hover { background: var(--brand-light) !important; }
  .dark input[type="text"], .dark input[type="number"] { background: var(--bg); color: var(--text); border-color: var(--border); }
  .dark .btn { background: var(--card); color: var(--text); border-color: var(--border); }
  .dark .btn:hover { background: var(--brand-light); }
  .dark .chip { background: var(--card); border-color: var(--border); color: var(--muted); }
  .dark .tag { background: var(--brand-light); color: var(--brand); }
  .dark .badge { border-color: rgba(255,255,255,0.1); }
  .dark .topbar-search { background: var(--bg); border-color: var(--border); }
  .dark .topbar-search input { color: var(--text); }
  .dark .topbar-icon-btn { border-color: var(--border); color: var(--muted); }
  .dark .topbar-icon-btn:hover { background: var(--bg); color: var(--text); }
  .dark .sidebar-nav-item:hover { background: var(--bg); }
  .dark .sidebar-nav-item.active { background: var(--brand-light); }
  .dark .course-item:hover { background: var(--brand-light); }
  .dark .scenario-card { background: var(--card); border-color: var(--border); }
  .dark .scenario-card.scenario-risk { background: var(--critical-bg); border-color: var(--critical-border); }
  .dark .scenario-card.scenario-improve { background: var(--ok-bg); border-color: var(--ok-border); }
  .dark .empty-state { background: var(--card); border-color: var(--border); }
  .dark .qc-flag { background: var(--bg); border-color: var(--border); }

  /* ── Print Mode: Optimize for printing a student profile ── */
  @media print {
    @page { margin: 1.5cm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: #fff !important; color: #000 !important; }

    /* Hide chrome (sidebar, topbar, FABs, buttons, panels) */
    .app-sidebar, .app-topbar, .ai-fab, .sidebar-backdrop,
    .course-panel-overlay, .voice-btn, .topbar-icon-btn,
    .main-tabs, .chip, .ai-panel,
    button:not(.print-visible) {
      display: none !important;
    }

    /* When a drawer is open, ONLY print the drawer content — hide the rest */
    body.drawer-is-open .app-main,
    body.drawer-is-open main.app-main {
      display: none !important;
    }

    /* Reset main content positioning */
    .app-main { margin-left: 0 !important; padding-top: 0 !important; }
    .app-content { padding: 0 !important; max-width: 100% !important; }

    /* Cards: avoid page breaks inside */
    .kpi-card {
      break-inside: avoid;
      page-break-inside: avoid;
      box-shadow: none !important;
      border: 1px solid #ccc !important;
      margin-bottom: 12px !important;
      padding: 14px !important;
    }

    /* Drawer overlay → static, full-width when printing */
    .drawer-print-mode {
      position: static !important;
      inset: auto !important;
      background: #fff !important;
      backdrop-filter: none !important;
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      z-index: auto !important;
    }
    .drawer-print-mode > div {
      position: static !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      box-shadow: none !important;
      border: none !important;
      animation: none !important;
      transform: none !important;
    }
    .drawer-enter { animation: none !important; transform: none !important; }

    /* Hide cesa-loader animations */
    .cesa-loader-wrap, .cesa-water-text { display: none !important; }

    /* Tables: keep rows together */
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }

    /* Feedback modal print: hide everything except the modal body */
    body.print-feedback-modal > *:not(.feedback-print-root) { display: none !important; }
    body.print-feedback-modal .feedback-print-root {
      position: static !important;
      inset: auto !important;
      background: #fff !important;
      backdrop-filter: none !important;
      padding: 0 !important;
      display: block !important;
    }
    body.print-feedback-modal .feedback-print-card {
      position: static !important;
      max-width: 100% !important;
      max-height: none !important;
      overflow: visible !important;
      box-shadow: none !important;
      border: none !important;
    }
    body.print-feedback-modal .feedback-print-root button { display: none !important; }

    .print-only { display: block !important; }
  }
  .print-only { display: none; }
  .app-topbar.sidebar-collapsed { left: 0; }
  .topbar-search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; width: 240px; transition: all 0.15s; }
  .topbar-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(11,95,255,0.1); width: 280px; }
  .topbar-search input { border: none; background: transparent; outline: none; font-size: 13px; font-weight: 500; color: var(--text); font-family: var(--font); flex: 1; }
  .topbar-search input::placeholder { color: var(--muted); }
  .topbar-icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid var(--border); background: transparent; cursor: pointer; color: var(--muted); font-size: 15px; transition: all 0.15s; flex-shrink: 0; }
  .topbar-icon-btn:hover { background: var(--bg); color: var(--text); }
  .topbar-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; cursor: pointer; }

  .app-main { margin-left: var(--sidebar-w); padding-top: 56px; min-height: 100vh; transition: margin-left 0.28s cubic-bezier(.4,0,.2,1); }
  .app-main.sidebar-collapsed { margin-left: 0; }
  .app-content { padding: 24px 28px; max-width: 100%; }

  @media (max-width: 1024px) {
    .app-sidebar { transform: translateX(calc(-1 * var(--sidebar-w))); }
    .app-sidebar.mobile-open { transform: translateX(0); }
    .app-topbar { left: 0; }
    .app-main { margin-left: 0; }
    .sidebar-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 90; backdrop-filter: blur(2px); }
  }

  .ai-fab { position: fixed; bottom: 28px; right: 28px; z-index: 200; }
  .ai-fab-btn { width: 56px; height: 56px; background: var(--brand); border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 20px rgba(11,95,255,0.4), 0 2px 8px rgba(11,95,255,0.2); transition: all 0.2s ease; position: relative; }
  .ai-fab-btn:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(11,95,255,0.5); }
  .ai-fab-btn.active { background: var(--brand-2); }
  .ai-fab-tooltip { position: absolute; bottom: 68px; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap; box-shadow: var(--shadow); animation: fadeUp 0.2s ease both; }
  .ai-fab-panel { position: absolute; bottom: 72px; right: 0; width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--shadow-lg); overflow: hidden; display: flex; flex-direction: column; max-height: 520px; animation: fadeUp 0.25s cubic-bezier(.4,0,.2,1) both; }
  @media (max-width: 480px) { .ai-fab-panel { width: calc(100vw - 48px); right: -4px; } }
  .ai-fab-panel-header { padding: 16px 18px; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }

  .grade-ring-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .grade-ring-svg { transform: rotate(-90deg); }
  .grade-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .route-card { background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%); border-radius: var(--radius); padding: 20px; color: #fff; position: relative; overflow: hidden; }
  .route-card::before { content: ''; position: absolute; top: -40px; right: -40px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.06); }
  .route-step { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.1); margin-bottom: 8px; }
  .route-step.done { background: rgba(255,255,255,0.15); }
  .route-step.pending { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); }

  .cesa-loader-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg); z-index: 100; }
  .cesa-loader-card { background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 40px 48px; text-align: center; box-shadow: var(--shadow-lg); min-width: 320px; max-width: 480px; }
  .cesa-loader-title { font-size: 20px; font-weight: 800; color: var(--text); }
  .cesa-loader-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .cesa-loader-center { margin: 28px 0; }
  .cesa-loader-foot { font-size: 12px; color: var(--muted); }

  .cesa-water-text { position: relative; display: inline-block; font-size: 56px; font-weight: 900; letter-spacing: -2px; overflow: hidden; height: 72px; line-height: 72px; }
  .cesa-water-text__outline { color: transparent; -webkit-text-stroke: 2px var(--border); }
  .cesa-water-text__fill { position: absolute; inset: 0; color: var(--brand); clip-path: inset(100% 0 0 0); animation: waterFill 1.8s ease-in-out infinite alternate; }
  .cesa-water-text__wave { position: absolute; bottom: 0; left: -100%; width: 300%; height: 100%; background: linear-gradient(90deg, transparent, rgba(11,95,255,.08), transparent); animation: waveSlide 2s linear infinite; }
  @keyframes waterFill { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0% 0 0 0); } }
  @keyframes waveSlide { from { transform: translateX(0); } to { transform: translateX(33.33%); } }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.35s ease both; }
  .fade-up-1 { animation-delay: 0.05s; }
  .fade-up-2 { animation-delay: 0.1s; }
  .fade-up-3 { animation-delay: 0.15s; }
  .fade-up-4 { animation-delay: 0.2s; }

  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
  .pulse-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; animation: pulse 1.4s ease infinite; }

  @keyframes fillBar { from { width: 0%; } to { width: var(--target-w); } }
  .fill-bar { animation: fillBar 0.7s cubic-bezier(.4,0,.2,1) both; animation-delay: 0.2s; }

  .drawer-enter { animation: drawerIn 0.28s cubic-bezier(.4,0,.2,1) both; }
  @keyframes drawerIn { from { transform: translateX(48px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  @keyframes tabIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .tab-enter { animation: tabIn 0.3s cubic-bezier(.4,0,.2,1) both; }

  .kpi-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .kpi-card:hover { box-shadow: var(--shadow-md) !important; }

  .sidebar-nav-item { transition: all 0.15s ease; }
  .sidebar-nav-item:not(.active):hover { transform: translateX(3px); }

  .tr-hover { transition: all 0.15s ease; }
  .tr-hover:hover { background: var(--brand-light) !important; }
  .tr-hover:hover td { color: var(--text) !important; }

  @media (max-width: 640px) {
    .app-content { padding: 14px 12px; }
    .kpi-card { padding: 14px; border-radius: 16px; }
    .ai-fab { bottom: 16px; right: 16px; }
    .ai-fab-panel { bottom: 68px; }
    .sidebar-logo-name { font-size: 11px; }
  }
  @media (max-width: 480px) {
    .ai-fab-panel { width: calc(100vw - 36px); right: -4px; }
    .ai-fab-btn { width: 48px; height: 48px; font-size: 18px; }
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; white-space: nowrap; letter-spacing: 0.04em; text-transform: uppercase; }

  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow); transition: box-shadow 0.2s ease, transform 0.2s ease; }
  .kpi-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }

  .tag { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.03em; background: var(--brand-light); color: var(--brand); }

  .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 700; background: var(--card); color: var(--muted); cursor: pointer; transition: all 0.15s ease; }
  .chip:hover, .chip.active { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }

  .btn { border: 1px solid var(--border); background: var(--card); color: var(--text); border-radius: 10px; padding: 8px 14px; cursor: pointer; font-weight: 700; font-size: 13px; font-family: var(--font); transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 6px; letter-spacing: -0.01em; }
  .btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(11,95,255,0.1); }
  .btn:active { transform: translateY(0); }
  .btn-primary { background: var(--brand); color: #fff; border-color: var(--brand); box-shadow: 0 2px 8px rgba(11,95,255,0.3); }
  .btn-primary:hover { background: var(--brand-2); color: #fff; border-color: var(--brand-2); box-shadow: 0 4px 14px rgba(11,95,255,0.4); }

  .scenario-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; background: var(--card); }
  .scenario-card.scenario-risk { border-color: #FECDCA; background: var(--critical-bg); }
  .scenario-card.scenario-base { border-color: var(--border); }
  .scenario-card.scenario-improve { border-color: #A9EFC5; background: var(--ok-bg); }

  .qc-flag { font-size: 12px; padding: 8px 12px; border-radius: 8px; background: var(--pending-bg); border: 1px solid var(--border); font-family: var(--font-mono); color: var(--muted); }

  input[type="text"], input[type="number"] { font-family: var(--font); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  input[type="text"]:focus, input[type="number"]:focus { border-color: var(--brand) !important; box-shadow: 0 0 0 3px rgba(11,95,255,0.12) !important; }

  /* === Global keyboard focus ring (a11y quick-win) ===
     Uses :focus-visible so mouse clicks don't show a ring, but Tab always does. */
  :focus { outline: none; }
  button:focus-visible,
  a:focus-visible,
  [role="button"]:focus-visible,
  [role="tab"]:focus-visible,
  [role="menuitem"]:focus-visible,
  [tabindex]:not([tabindex="-1"]):focus-visible,
  .btn:focus-visible,
  .btn-primary:focus-visible,
  .chip:focus-visible,
  .tag:focus-visible,
  .topbar-icon-btn:focus-visible,
  .sidebar-nav-item:focus-visible,
  .course-item:focus-visible,
  .ai-fab-btn:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px var(--focus-ring);
    border-radius: 8px;
  }
  /* Campos de formulario: muchos estilos inline ponen outline:none, así que el
     indicador de foco usa box-shadow (no lo pisa el estilo inline). */
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
  input[type="checkbox"]:focus-visible,
  input[type="radio"]:focus-visible,
  input[type="range"]:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  /* Round elements deserve a matching ring */
  .topbar-avatar:focus-visible,
  .ai-fab-btn:focus-visible {
    border-radius: 50%;
  }
  /* Skip-link helper (for future use). Hidden until focused. */
  .skip-link {
    position: absolute; left: 12px; top: -40px; z-index: 10001;
    background: var(--brand); color: #fff;
    padding: 8px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 700;
    transition: top 0.15s ease;
  }
  .skip-link:focus { top: 12px; }
  main[tabindex="-1"]:focus { outline: none; }

  .breadcrumb-link:hover { color: var(--brand); background: var(--brand-light); }

  .scroll-y { overflow-y: auto; overflow-x: hidden; }
  .ra-scroll { max-height: 260px; padding-right: 4px; }
  .ra-priority-scroll { max-height: 380px; padding-right: 4px; overflow-y: auto; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--muted-strong); border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg2); text-align: center; }
  .empty-state-icon { font-size: 36px; opacity: 0.35; }
  .empty-state > span:nth-child(2) { font-size: 14px; font-weight: 700; color: var(--muted); }

  .course-panel-overlay { position: fixed; inset: 0; background: rgba(13,17,23,0.5); z-index: 60; display: flex; align-items: flex-start; justify-content: flex-end; padding: 0; backdrop-filter: blur(2px); animation: fadeIn 0.2s ease both; }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .course-panel { width: min(480px, 100vw); height: 100vh; background: var(--card); border-left: 1px solid var(--border); display: flex; flex-direction: column; animation: slideIn 0.28s cubic-bezier(.4,0,.2,1) both; box-shadow: -8px 0 40px rgba(0,0,0,0.15); }
  @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .course-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s ease; text-decoration: none; }
  .course-item:hover { background: var(--brand-light); }
  .course-item.active { background: var(--brand-light); border-left: 3px solid var(--brand); }
  .course-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .voice-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); cursor: pointer; transition: all 0.15s ease; font-size: 15px; flex-shrink: 0; color: var(--muted); }
  .voice-btn:hover { border-color: var(--brand); background: var(--brand-light); color: var(--brand); }
  .voice-btn.listening { border-color: var(--critical); background: var(--critical-bg); color: var(--critical); animation: voicePulse 1s ease infinite; }
  @keyframes voicePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0.3); } 50% { box-shadow: 0 0 0 6px rgba(217,45,32,0); } }
  @keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ==== NEW ANIMATIONS FOR VISUAL REDESIGN ==== */
  @keyframes floatIn { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes slideUpFade { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmerCard { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
  @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  @keyframes iconBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes chartDraw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
  @keyframes rotateGlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

  /* ══ PageLoader animations (CESA-branded transition loader) ══ */
  @keyframes cesaLogoBreath {
    0%, 100% { transform: scale(1); box-shadow: 0 12px 40px -12px rgba(11, 95, 255, 0.55), 0 0 0 0 rgba(11, 95, 255, 0.35); }
    50%      { transform: scale(1.06); box-shadow: 0 16px 48px -12px rgba(11, 95, 255, 0.65), 0 0 0 14px rgba(11, 95, 255, 0); }
  }
  @keyframes cesaOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cesaOrbitReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
  @keyframes cesaShimmerText { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes cesaDotRise {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
    40%           { transform: translateY(-8px); opacity: 1; }
  }
  @keyframes cesaBarProgress {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
  @keyframes cesaCardIn {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cesa-loader-root {
    min-height: 100vh; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Manrope', system-ui, sans-serif;
    position: relative; overflow: hidden;
  }
  .cesa-loader-root::before,
  .cesa-loader-root::after {
    content: ""; position: absolute; border-radius: 50%; pointer-events: none;
    filter: blur(80px); opacity: 0.35;
  }
  .cesa-loader-root::before {
    width: 420px; height: 420px; top: -140px; left: -140px;
    background: radial-gradient(circle, rgba(11, 95, 255, 0.55), transparent 70%);
    animation: cesaLogoBreath 4.5s ease-in-out infinite;
  }
  .cesa-loader-root::after {
    width: 380px; height: 380px; bottom: -120px; right: -120px;
    background: radial-gradient(circle, rgba(96, 165, 250, 0.45), transparent 70%);
    animation: cesaLogoBreath 5.2s ease-in-out infinite 0.6s;
  }
  .cesa-loader-card {
    position: relative; z-index: 1;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 24px; padding: 44px 56px 32px; text-align: center;
    box-shadow: 0 24px 60px -20px rgba(15, 24, 39, 0.18), 0 8px 24px -8px rgba(15, 24, 39, 0.08);
    animation: cesaCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    min-width: 300px;
  }
  .cesa-loader-logo-wrap {
    position: relative; width: 96px; height: 96px; margin: 0 auto 22px;
    display: flex; align-items: center; justify-content: center;
  }
  .cesa-loader-logo {
    width: 68px; height: 68px; border-radius: 18px;
    background: linear-gradient(135deg, var(--brand) 0%, #1e40af 100%);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 15px; font-weight: 900; letter-spacing: 0.06em;
    animation: cesaLogoBreath 2.2s ease-in-out infinite;
    position: relative; z-index: 2;
  }
  .cesa-loader-ring {
    position: absolute; inset: 0;
    border-radius: 50%; border: 2px solid transparent;
    border-top-color: var(--brand); border-right-color: var(--brand);
    opacity: 0.7;
    animation: cesaOrbit 1.6s linear infinite;
  }
  .cesa-loader-ring.outer {
    inset: -8px;
    border-top-color: transparent; border-right-color: transparent;
    border-bottom-color: #60a5fa; border-left-color: #60a5fa;
    opacity: 0.5;
    animation: cesaOrbitReverse 2.4s linear infinite;
  }
  .cesa-loader-title {
    font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--text) 0%, var(--brand) 40%, var(--text) 80%);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: cesaShimmerText 2.6s linear infinite;
    margin: 0 0 6px;
  }
  .cesa-loader-subtitle {
    font-size: 11px; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.16em;
    margin: 0 0 18px;
  }
  .cesa-loader-dots { display: inline-flex; gap: 6px; margin-bottom: 16px; }
  .cesa-loader-dots span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--brand);
    animation: cesaDotRise 1.2s ease-in-out infinite;
  }
  .cesa-loader-dots span:nth-child(2) { animation-delay: 0.15s; background: #3b82f6; }
  .cesa-loader-dots span:nth-child(3) { animation-delay: 0.30s; background: #60a5fa; }
  .cesa-loader-bar {
    position: relative; height: 3px; width: 100%;
    background: var(--bg); border-radius: 99px; overflow: hidden;
  }
  .cesa-loader-bar::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, var(--brand) 35%, #60a5fa 65%, transparent 100%);
    animation: cesaBarProgress 1.6s ease-in-out infinite;
  }
  @media (max-width: 480px) {
    .cesa-loader-card { padding: 36px 32px 28px; min-width: 260px; }
    .cesa-loader-logo-wrap { width: 84px; height: 84px; }
    .cesa-loader-logo { width: 58px; height: 58px; font-size: 13px; }
    .cesa-loader-title { font-size: 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    /* Loader ya cubierto anteriormente */
    .cesa-loader-logo, .cesa-loader-ring, .cesa-loader-ring.outer,
    .cesa-loader-title, .cesa-loader-dots span, .cesa-loader-bar::after,
    .cesa-loader-root::before, .cesa-loader-root::after { animation: none !important; }

    /* Regla global: acorta o elimina todas las animaciones y transiciones
       para usuarios que solicitan menos movimiento. Se mantiene un mínimo
       (0.01ms) para no romper componentes que dependen del evento
       animationend/transitionend. */
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    /* Silencia efectos específicos que suelen ser molestos con este ajuste */
    .stagger-children > * { opacity: 1 !important; animation: none !important; }
    .pulse-dot, .ai-fab-btn, .skip-link { animation: none !important; transition: none !important; }
  }

  /* Stagger animation classes — add to a container with .stagger-children, direct children fade in sequentially */
  .stagger-children > * { opacity: 0; animation: floatIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .stagger-children > *:nth-child(1) { animation-delay: 0.02s; }
  .stagger-children > *:nth-child(2) { animation-delay: 0.06s; }
  .stagger-children > *:nth-child(3) { animation-delay: 0.10s; }
  .stagger-children > *:nth-child(4) { animation-delay: 0.14s; }
  .stagger-children > *:nth-child(5) { animation-delay: 0.18s; }
  .stagger-children > *:nth-child(6) { animation-delay: 0.22s; }
  .stagger-children > *:nth-child(7) { animation-delay: 0.26s; }
  .stagger-children > *:nth-child(8) { animation-delay: 0.30s; }
  .stagger-children > *:nth-child(9) { animation-delay: 0.34s; }
  .stagger-children > *:nth-child(n+10) { animation-delay: 0.38s; }

  /* Course card grid — responsive */
  .course-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  @media (max-width: 640px) { .course-grid { grid-template-columns: 1fr; gap: 10px; } }

  /* Visual course card */
  .course-card-v2 {
    position: relative; display: flex; flex-direction: column; padding: 16px;
    border-radius: 14px; border: 1.5px solid var(--border); background: var(--card);
    cursor: pointer; text-align: left; font-family: var(--font); width: 100%;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease;
    overflow: hidden; min-height: 128px;
  }
  .course-card-v2::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--brand) 0%, var(--brand-2, var(--brand)) 100%);
    transform: scaleX(0); transform-origin: left; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .course-card-v2:hover { transform: translateY(-3px); box-shadow: 0 12px 28px -12px rgba(11, 95, 255, 0.28), var(--shadow-md); border-color: var(--brand); }
  .course-card-v2:hover::before { transform: scaleX(1); }
  .course-card-v2.role-student::before { background: linear-gradient(90deg, var(--ok) 0%, #22c55e 100%); }
  .course-card-v2.role-student:hover { border-color: var(--ok); box-shadow: 0 12px 28px -12px rgba(18, 183, 106, 0.28), var(--shadow-md); }
  .course-card-v2.inactive { opacity: 0.65; }

  .course-card-icon {
    width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--brand-light) 0%, rgba(11, 95, 255, 0.08) 100%);
    color: var(--brand); margin-bottom: 12px; transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .course-card-v2:hover .course-card-icon { transform: scale(1.08) rotate(-4deg); }
  .course-card-v2.role-student .course-card-icon {
    background: linear-gradient(135deg, var(--ok-bg) 0%, rgba(18, 183, 106, 0.08) 100%);
    color: var(--ok);
  }

  .course-card-title {
    font-size: 14px; font-weight: 800; color: var(--text); line-height: 1.35;
    margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; text-overflow: ellipsis;
  }
  .course-card-meta { display: flex; align-items: center; gap: 6px; margin-top: auto; flex-wrap: wrap; }
  .course-card-id { font-size: 11px; color: var(--muted); font-family: var(--mono, monospace); font-weight: 600; }
  .course-card-arrow {
    position: absolute; bottom: 14px; right: 14px; color: var(--brand); opacity: 0;
    transform: translateX(-6px); transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
  }
  .course-card-v2:hover .course-card-arrow { opacity: 1; transform: translateX(0); }
  .course-card-v2.role-student .course-card-arrow { color: var(--ok); }

  /* Section header v2 (icon + title + count) */
  .section-header-v2 { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .section-header-icon-wrap {
    width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--brand-light) 0%, rgba(11, 95, 255, 0.06) 100%);
    color: var(--brand); flex-shrink: 0;
  }
  .section-header-icon-wrap.student { background: linear-gradient(135deg, var(--ok-bg) 0%, rgba(18, 183, 106, 0.06) 100%); color: var(--ok); }
  .section-header-icon-wrap.warn { background: linear-gradient(135deg, rgba(255, 170, 0, 0.14) 0%, rgba(255, 170, 0, 0.04) 100%); color: #f59e0b; }
  .section-header-title { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
  .section-header-count { font-size: 11px; color: var(--muted); font-weight: 700; margin-top: 2px; }

  /* Panel card (RoleHome sections) */
  .home-panel {
    background: var(--card); border: 1px solid var(--border); border-radius: 20px;
    padding: 22px; box-shadow: var(--shadow);
    animation: floatIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .home-panel.superadmin-brand { border-color: rgba(11, 95, 255, 0.35); }
  .home-panel.superadmin-warn { border-color: rgba(255, 170, 0, 0.35); }

  /* ===== Admin Console (Super Admin RoleHome) ===== */
  .admin-hero {
    position: relative; overflow: hidden;
    border-radius: 22px; padding: 26px 28px;
    background: linear-gradient(135deg, var(--brand-2) 0%, var(--brand) 58%, #2f6bff 100%);
    color: #fff; box-shadow: 0 20px 44px -20px rgba(11, 95, 255, 0.6);
    margin-bottom: 22px;
    animation: floatIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .admin-hero::after {
    content: ""; position: absolute; top: -45%; right: -8%;
    width: 360px; height: 360px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
    pointer-events: none;
  }
  .admin-hero::before {
    content: ""; position: absolute; bottom: -60%; left: 10%;
    width: 300px; height: 300px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
    pointer-events: none;
  }
  .admin-hero-inner { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .admin-hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 12px; border-radius: 99px;
    background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.25);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;
    margin-bottom: 12px;
  }
  .admin-hero-title { font-size: 30px; font-weight: 900; letter-spacing: -0.035em; line-height: 1.05; margin: 0; }
  .admin-hero-sub { font-size: 14px; opacity: 0.92; margin-top: 8px; font-weight: 500; max-width: 460px; line-height: 1.5; }
  .admin-hero-clock {
    text-align: right; flex-shrink: 0;
    font-size: 12px; font-weight: 600; opacity: 0.9;
  }
  .admin-hero-clock .big { font-size: 22px; font-weight: 800; font-family: var(--font-mono); letter-spacing: -0.01em; display: block; }

  .admin-stat-row {
    position: relative; z-index: 1; margin-top: 22px;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;
  }
  .admin-stat {
    background: rgba(255,255,255,0.13); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 14px; padding: 13px 15px;
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    transition: background 0.18s ease, transform 0.18s ease;
  }
  .admin-stat:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
  .admin-stat-value { font-size: 26px; font-weight: 900; font-family: var(--font-mono); line-height: 1; display: flex; align-items: baseline; gap: 4px; }
  .admin-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-top: 7px; display: flex; align-items: center; gap: 5px; }

  .admin-section-label {
    display: flex; align-items: center; gap: 12px; margin: 4px 0 -4px;
    font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted);
  }
  .admin-section-label > .lbl { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .admin-section-label::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .admin-tools-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; }
  .admin-tools-grid > .home-panel { margin: 0; animation-delay: 0s; }
  .admin-tools-grid > .span-full { grid-column: 1 / -1; }
  @media (max-width: 720px) { .admin-tools-grid { grid-template-columns: 1fr; } }

  /* Icon chip inline */
  .icon-chip { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; }

  /* Chart wrapper animation */
  .chart-appear { animation: slideUpFade 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }

  /* Loading dots */
  .loading-dots { display: inline-flex; gap: 4px; align-items: center; }
  .loading-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); animation: pulse 1.2s ease-in-out infinite; }
  .loading-dots span:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.3s; }

  /* Empty state v2 */
  .empty-v2 {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 40px 20px; text-align: center; color: var(--muted);
    border: 1.5px dashed var(--border); border-radius: 16px; background: var(--bg);
    animation: fadeIn 0.35s ease both;
  }
  .empty-v2-icon {
    width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
    background: var(--brand-light); color: var(--brand); margin-bottom: 12px; opacity: 0.75;
  }

  .voice-hint { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 10px; border: 1px dashed var(--border); background: var(--bg); color: var(--muted); font-size: 11px; font-weight: 600; flex-wrap: wrap; }

  .main-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 0; }
  .main-tab { padding: 8px 16px 10px; font-size: 12px; font-weight: 700; color: var(--muted); cursor: pointer; border-radius: 8px 8px 0 0; border: 1px solid transparent; border-bottom: none; background: transparent; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; margin-bottom: -1px; position: relative; }
  .main-tab:hover { color: var(--text); background: var(--card); border-color: var(--border); }
  .main-tab.active { color: var(--brand); background: var(--card); border-color: var(--border); border-bottom-color: var(--card); }
  .main-tab .tab-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.6; }

  .ai-panel { display: flex; flex-direction: column; gap: 14px; }
  .ai-status-outer { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); transition: all 0.25s; min-height: 48px; }
  .ai-status-outer.listening { border-color: rgba(217,45,32,0.45); background: var(--critical-bg); }
  .ai-status-outer.thinking { border-color: rgba(11,95,255,0.35); background: var(--brand-light); }
  .ai-status-outer.speaking { border-color: rgba(18,183,106,0.35); background: var(--ok-bg); }
  .ai-status-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; background: var(--card); border: 1px solid var(--border); }
  .ai-wave { display: flex; align-items: center; gap: 2px; height: 18px; }
  .ai-wave-bar { width: 3px; border-radius: 2px; animation: waveAI 1.1s ease-in-out infinite; }
  .ai-wave-bar:nth-child(1) { height: 6px; animation-delay: 0s; }
  .ai-wave-bar:nth-child(2) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(3) { height: 18px; animation-delay: 0.2s; }
  .ai-wave-bar:nth-child(4) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(5) { height: 6px; animation-delay: 0s; }
  @keyframes waveAI { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
  .ai-chat { background: var(--bg2, var(--bg)); border: 1px solid var(--border); border-radius: 12px; padding: 12px 10px; max-height: 300px; min-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
  .ai-bubble-wrap { display: flex; flex-direction: column; }
  .ai-bubble-wrap.user { align-items: flex-end; }
  .ai-bubble-wrap.bot { align-items: flex-start; }
  .ai-bubble { max-width: 86%; font-size: 12.5px; line-height: 1.55; padding: 9px 13px; border-radius: 8px; }
  .ai-bubble.bot { background: var(--card); border: 1px solid var(--border); border-radius: 2px 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .ai-bubble.user { background: var(--brand-light2, var(--brand-light)); border: 1px solid rgba(11,95,255,0.25); border-radius: 12px 2px 12px 12px; color: var(--text); }
  .ai-meta { font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
  .ai-voice-badge { background: var(--brand-light); color: var(--brand); border-radius: 999px; padding: 1px 7px; font-size: 9px; font-weight: 700; }
  .ai-speak-btn { border: 1px solid var(--border); background: transparent; border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 700; color: var(--muted); cursor: pointer; margin-top: 5px; transition: all 0.15s; }
  .ai-speak-btn:hover { border-color: var(--ok); color: var(--ok); }
  .ai-speak-btn.active { border-color: var(--ok); color: var(--ok); background: var(--ok-bg); }
  .ai-typing { display: flex; align-items: center; gap: 4px; padding: 6px 2px; }
  .ai-typing-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--brand); animation: waveAI 1.2s ease-in-out infinite; }
  .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
  .ai-chip-btn { background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 5px 13px; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .ai-chip-btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }
  .ai-input { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 12px; font-weight: 600; background: var(--card); color: var(--text); outline: none; transition: border-color 0.15s, box-shadow 0.15s; font-family: var(--font); }
  .ai-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(11,95,255,0.1); }
  .ai-input::placeholder { color: var(--muted); }
  .ai-send-btn { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 12px; font-weight: 800; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; font-family: var(--font); }
  .ai-send-btn:hover { opacity: 0.85; }
  .ai-toggle { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); cursor: pointer; transition: all 0.15s; user-select: none; }
  .ai-toggle.active { border-color: var(--ok); background: var(--ok-bg); }
  .ai-toggle-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); transition: background 0.2s; }
  .ai-toggle.active .ai-toggle-dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .ai-stop-btn { background: var(--critical-bg); border: 1px solid rgba(217,45,32,0.3); border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 700; color: var(--critical); cursor: pointer; transition: all 0.15s; display: none; }
  .ai-stop-btn.visible { display: block; }
  .ai-guide-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 640px) {
    .ai-guide-grid { grid-template-columns: 1fr; }
    .main-tabs { overflow-x: auto; }
  }
`,Y=`gemelo_oauth_pending`,X=12e4;function Z(){let e=localStorage.getItem(Y);if(!e)return!1;let t=Date.now()-Number(e);return t>2e3&&t<X}function Q(e){e.msgH&&=(window.removeEventListener(`message`,e.msgH),null),e.poll&&=(clearInterval(e.poll),null),e.timer&&=(clearTimeout(e.timer),null)}function $({orgUnitId:e}){let[t,n]=(0,l.useState)(()=>Z()?`retry`:`idle`),r=(0,l.useRef)({popup:null,msgH:null,poll:null,timer:null,retries:0});(0,l.useEffect)(()=>{J(),localStorage.getItem(Y)&&!Z()&&localStorage.removeItem(Y);let e=r.current;return()=>Q(e)},[]);let i=m(e>0?`/auth/brightspace/login?org_unit_id=${e}`:`/auth/brightspace/login`);function a(e){Q(r.current),r.current.popup&&!r.current.popup.closed&&r.current.popup.close(),_(e),localStorage.removeItem(Y),window.location.reload()}function o(){let e=r.current;Q(e);let t=Math.round((screen.width-520)/2),o=Math.round((screen.height-680)/2),s=window.open(i,`gemelo-oauth`,`width=520,height=680,left=${t},top=${o},scrollbars=yes,resizable=yes`);if(!s){localStorage.setItem(Y,String(Date.now())),n(`redirect`),window.location.href=i;return}e.popup=s,localStorage.setItem(Y,String(Date.now())),n(`waiting`),e.msgH=e=>{e.origin===window.location.origin&&e.data?.type===`gemelo-auth`&&a(e.data.sid)},window.addEventListener(`message`,e.msgH),e.timer=setTimeout(()=>{Q(e),n(`retry`)},X),e.poll=setInterval(()=>{if(!e.popup||e.popup.closed){if(clearInterval(e.poll),e.poll=null,!e.msgH)return;Q(e),e.retries<1?(e.retries+=1,n(`retry`)):(localStorage.removeItem(Y),n(`idle`))}},500)}function s(e){e.preventDefault(),r.current.retries=0,o()}function c(e){e.preventDefault(),o()}let u={background:`var(--card)`,border:`1px solid var(--border)`,borderRadius:24,padding:`40px 48px`,textAlign:`center`,maxWidth:440,width:`100%`,boxShadow:`0 8px 32px rgba(15,24,39,0.12), 0 16px 48px rgba(15,24,39,0.08)`},d={display:`flex`,alignItems:`center`,justifyContent:`center`,gap:10,width:`100%`,padding:`13px 20px`,borderRadius:12,textDecoration:`none`,border:`none`,cursor:`pointer`,fontSize:14,fontWeight:800,transition:`opacity 0.15s`},f=(0,D.jsxs)(`svg`,{width:`18`,height:`18`,viewBox:`0 0 21 21`,fill:`none`,children:[(0,D.jsx)(`rect`,{x:`0`,y:`0`,width:`10`,height:`10`,fill:`#F25022`}),(0,D.jsx)(`rect`,{x:`11`,y:`0`,width:`10`,height:`10`,fill:`#7FBA00`}),(0,D.jsx)(`rect`,{x:`0`,y:`11`,width:`10`,height:`10`,fill:`#00A4EF`}),(0,D.jsx)(`rect`,{x:`11`,y:`11`,width:`10`,height:`10`,fill:`#FFB900`})]});return(0,D.jsx)(`main`,{role:`main`,"aria-label":`Inicio de sesion - Visor de desempeño estudiantil CESA`,style:{minHeight:`100vh`,background:`var(--bg)`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Manrope', system-ui, sans-serif`,padding:20},children:(0,D.jsxs)(`div`,{role:`region`,"aria-label":`Formulario de autenticacion`,style:u,children:[(0,D.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,justifyContent:`center`,gap:12,marginBottom:28},children:[(0,D.jsx)(`div`,{style:{width:48,height:48,borderRadius:13,background:`var(--brand)`,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`var(--on-brand)`,fontSize:15,fontWeight:900,letterSpacing:`-0.03em`},children:`CESA`}),(0,D.jsxs)(`div`,{style:{textAlign:`left`},children:[(0,D.jsx)(`div`,{style:{fontSize:16,fontWeight:900,color:`var(--text)`,letterSpacing:`-0.02em`},children:`Visor de desempeño estudiantil`}),(0,D.jsx)(`div`,{style:{fontSize:11,fontWeight:600,color:`var(--muted)`,textTransform:`uppercase`,letterSpacing:`0.08em`},children:`2026.8.7`})]})]}),(0,D.jsx)(`div`,{style:{height:1,background:`var(--border)`,margin:`0 0 28px`}}),t===`waiting`&&(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(`div`,{style:{marginBottom:14,display:`flex`,justifyContent:`center`,color:`var(--brand)`},children:(0,D.jsx)(R,{size:30,strokeWidth:2.2,style:{animation:`rotateGlow 1s linear infinite`}})}),(0,D.jsx)(`h2`,{style:{fontSize:20,fontWeight:900,color:`var(--text)`,margin:`0 0 8px`,letterSpacing:`-0.02em`},children:`Autenticando…`}),(0,D.jsxs)(`p`,{style:{fontSize:14,color:`var(--muted)`,lineHeight:1.6,margin:`0 0 20px`},children:[`Completa el inicio de sesion en la ventana que se acaba de abrir.`,(0,D.jsx)(`br`,{}),`Si no ves la ventana, revisa si fue bloqueada por tu navegador.`]}),(0,D.jsx)(`button`,{onClick:s,style:{...d,background:`var(--border)`,color:`var(--muted)`,fontSize:12,padding:`9px 16px`},children:`Abrir ventana de nuevo`})]}),t===`retry`&&(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(`div`,{style:{marginBottom:14,display:`flex`,justifyContent:`center`,color:`var(--ok, #12b76a)`},children:(0,D.jsx)(P,{size:30,strokeWidth:2.2})}),(0,D.jsx)(`h2`,{style:{fontSize:20,fontWeight:900,color:`var(--text)`,margin:`0 0 8px`,letterSpacing:`-0.02em`},children:`Ya iniciaste sesion en Microsoft`}),(0,D.jsx)(`p`,{style:{fontSize:14,color:`var(--muted)`,lineHeight:1.6,margin:`0 0 20px`},children:`La autenticacion con Microsoft fue exitosa. Haz clic para completar el acceso al Visor de desempeño estudiantil.`}),(0,D.jsxs)(`button`,{onClick:c,style:{...d,background:`var(--brand)`,color:`var(--on-brand)`,boxShadow:`0 4px 16px rgba(11,95,255,0.3)`},onMouseEnter:e=>e.currentTarget.style.opacity=`0.88`,onMouseLeave:e=>e.currentTarget.style.opacity=`1`,children:[f,`Completar acceso al Visor de desempeño estudiantil`]}),(0,D.jsx)(`button`,{onClick:s,style:{...d,background:`transparent`,color:`var(--muted)`,fontSize:12,padding:`9px 16px`,marginTop:8,textDecoration:`underline`},children:`Iniciar sesion con otra cuenta`})]}),(t===`idle`||t===`redirect`)&&(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(`h2`,{style:{fontSize:22,fontWeight:900,color:`var(--text)`,letterSpacing:`-0.02em`,margin:`0 0 8px`},children:`Bienvenido`}),(0,D.jsx)(`p`,{style:{fontSize:14,color:`var(--muted)`,lineHeight:1.6,margin:`0 0 28px`},children:`Para acceder a tu tablero, inicia sesion con tu cuenta CESA de Brightspace. Seras redirigido a Microsoft para autenticarte.`}),(0,D.jsxs)(`button`,{onClick:s,style:{...d,background:`var(--brand)`,color:`var(--on-brand)`,boxShadow:`0 4px 16px rgba(11,95,255,0.3)`},onMouseEnter:e=>e.currentTarget.style.opacity=`0.88`,onMouseLeave:e=>e.currentTarget.style.opacity=`1`,children:[f,`Iniciar sesion con Microsoft`]}),(0,D.jsx)(`p`,{style:{fontSize:11,color:`var(--muted)`,marginTop:18,lineHeight:1.5},children:`Docentes y estudiantes con cursos activos en Brightspace pueden acceder. Si tienes problemas, contacta a soporte CESA.`}),(0,D.jsx)(`div`,{style:{marginTop:20,padding:`10px 14px`,borderRadius:10,background:`var(--brand-light)`,border:`1px solid var(--brand-light2, #D6E4FF)`},children:(0,D.jsx)(`p`,{style:{fontSize:11,color:`var(--brand)`,fontWeight:700,margin:0},children:`Tambien puedes acceder directamente desde tu curso en Brightspace usando el enlace de la herramiental Visor de desempeño estudiantil.`})})]})]})})}function Be({title:e=`Visor de desempeño estudiantil`,subtitle:t=`Cargando`,footer:n=null}){return(0,l.useEffect)(()=>{J()},[]),(0,D.jsx)(`div`,{role:`status`,"aria-live":`polite`,"aria-busy":`true`,"aria-label":`${t} ${e}`,className:`cesa-loader-root`,children:(0,D.jsxs)(`div`,{className:`cesa-loader-card`,children:[(0,D.jsxs)(`div`,{className:`cesa-loader-logo-wrap`,children:[(0,D.jsx)(`span`,{className:`cesa-loader-ring outer`,"aria-hidden":`true`}),(0,D.jsx)(`span`,{className:`cesa-loader-ring`,"aria-hidden":`true`}),(0,D.jsx)(`div`,{className:`cesa-loader-logo`,children:`CESA`})]}),(0,D.jsx)(`h1`,{className:`cesa-loader-title`,children:e}),(0,D.jsx)(`div`,{className:`cesa-loader-subtitle`,children:t}),(0,D.jsxs)(`div`,{className:`cesa-loader-dots`,"aria-hidden":`true`,children:[(0,D.jsx)(`span`,{}),(0,D.jsx)(`span`,{}),(0,D.jsx)(`span`,{})]}),(0,D.jsx)(`div`,{className:`cesa-loader-bar`,"aria-hidden":`true`}),n&&(0,D.jsx)(`div`,{style:{fontSize:11,color:`var(--muted)`,marginTop:14,fontWeight:500,lineHeight:1.5,maxWidth:320,marginLeft:`auto`,marginRight:`auto`},children:n})]})})}var Ve=(0,l.lazy)(()=>n(()=>import(`./RoleHome-C64crp2F.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8]))),He=(0,l.lazy)(()=>n(()=>import(`./TeacherDashboard-VEqo5Xni.js`),__vite__mapDeps([9,1,2,4,6,7,10,11,12,13,8,14,15,16]))),Ue=(0,l.lazy)(()=>n(()=>import(`./StudentPortal-2iKketPX.js`),__vite__mapDeps([17,1,2,10,11,8,14,16]))),We=(0,l.lazy)(()=>n(()=>import(`./CoordinatorDashboard-M7u93anv.js`),__vite__mapDeps([18,1,2,11,13,8]))),Ge=(0,l.lazy)(()=>n(()=>import(`./LearningOutcomesAdmin-DT7AHw-T.js`),__vite__mapDeps([19,1,2,20,5,6,7,12,11,15,14]))),Ke=(0,l.lazy)(()=>n(()=>import(`./AdminPanel--k0YB9Yf.js`),__vite__mapDeps([21,1,2,3,20,7,10,12,11])));function qe(){return(0,D.jsx)(Be,{subtitle:`Cargando página`})}function Je(){let{authUser:e,authChecked:n,isDualRole:r,isStudent:a,isSuperAdmin:o}=f();return n?e?(0,D.jsxs)(l.Suspense,{fallback:(0,D.jsx)(qe,{}),children:[(0,D.jsx)(`a`,{href:`#main-content`,className:`skip-link`,children:`Saltar al contenido principal`}),(0,D.jsxs)(t,{children:[(0,D.jsx)(i,{path:`/dashboard/*`,element:(0,D.jsx)(q,{allowedRoles:[`instructor`,`admin`],children:(0,D.jsx)(K,{sectionName:`Dashboard Docente`,children:(0,D.jsx)(He,{})})})}),(0,D.jsx)(i,{path:`/coordinator`,element:(0,D.jsx)(q,{allowedRoles:[`instructor`,`admin`],children:(0,D.jsx)(K,{sectionName:`Panel Coordinador`,children:(0,D.jsx)(We,{})})})}),(0,D.jsx)(i,{path:`/outcomes`,element:(0,D.jsx)(q,{allowedRoles:[`instructor`,`admin`],children:(0,D.jsx)(K,{sectionName:`Resultados de Aprendizaje`,children:(0,D.jsx)(Ge,{})})})}),(0,D.jsx)(i,{path:`/admin`,element:(0,D.jsx)(q,{allowedRoles:[`instructor`,`admin`],children:(0,D.jsx)(K,{sectionName:`Panel de Administración`,children:(0,D.jsx)(Ke,{})})})}),(0,D.jsx)(i,{path:`/portal/*`,element:(0,D.jsx)(q,{allowedRoles:[`student`],children:(0,D.jsx)(K,{sectionName:`Portal Estudiante`,children:(0,D.jsx)(Ue,{})})})}),(0,D.jsx)(i,{path:`/login`,element:(0,D.jsx)($,{})}),(0,D.jsx)(i,{path:`/`,element:r||o?(0,D.jsx)(Ve,{}):(0,D.jsx)(s,{to:a?`/portal`:`/dashboard`,replace:!0})}),(0,D.jsx)(i,{path:`*`,element:r||o?(0,D.jsx)(s,{to:`/`,replace:!0}):(0,D.jsx)(s,{to:a?`/portal`:`/dashboard`,replace:!0})})]})]}):(0,D.jsx)($,{}):(0,D.jsx)(qe,{})}function Ye(){return(0,l.useEffect)(()=>{J()},[]),(0,D.jsx)(o,{children:(0,D.jsx)(Re,{children:(0,D.jsx)(ve,{children:(0,D.jsx)(Ne,{children:(0,D.jsx)(ge,{children:(0,D.jsx)(K,{sectionName:`Visor de desempeño estudiantil`,children:(0,D.jsx)(Je,{})})})})})})})}window.addEventListener(`vite:preloadError`,e=>{let t=`gemelo_chunk_reload_at`,n=Number(sessionStorage.getItem(t)||0);Date.now()-n<6e4||(sessionStorage.setItem(t,String(Date.now())),e.preventDefault(),window.location.reload())}),(0,u.createRoot)(document.getElementById(`root`)).render((0,D.jsx)(l.StrictMode,{children:(0,D.jsx)(Ye,{})}));export{fe as C,de as S,f as T,se as _,V as a,v as b,R as c,P as d,N as f,ue as g,w as h,Ie as i,I as l,re as m,J as n,B as o,_e as p,K as r,z as s,Be as t,F as u,ce as v,_ as w,g as x,m as y};