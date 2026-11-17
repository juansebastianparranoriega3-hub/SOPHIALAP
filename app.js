/* ==========================================================
   SOPHIALAP · Filosofía e informática global (SPA en JS vanilla)
   Fundamentos de Algoritmia · Universidad de Córdoba · 2026
   Índice (en el orden en que aparece en el archivo):
   1.  Estado, almacenamiento local y sincronización (estado, api, setSync, save)
   2.  Utilidades (escaparHTML, barajar, anuncios, cabecera, pie, confeti)
   3.  Datos del curso: PERIODOS (teoría y actividades de cada periodo)
   4.  Notas y calificación (PESOS, notaPeriodo, notaFinal, nivel)
   5.  Teoría y recursos (vistaTeoria, vistaRecursosDocente)
   6.  Informe HTML grupal para el docente (informeGrupal)
   6b. Reporte HTML individual por estudiante (reporteIndividual)
   7.  Diálogos y pistas (dialogo, pistasOrden, pistasVF, PISTAS_ESCRITURA)
   3b. Retos del periodo: RETOS y pistasReto
   8.  Actividades de comprobación V/F y retos (preguntasDelPaso, responderPregunta)
   9.  Panel docente: datos de la nube (teacherMap, loadTeacherData)
   9b. Panel docente: estadísticas, gráficos y detalle del estudiante
   10. Vistas (objeto `vistas`): cover, login, home, map, unit, final, doc
   11. Render (`render`) y navegación (`irA`)
   12. Acciones (objeto `acciones`, despachadas por data-a / data-i)
   13. Eventos globales (clic, teclado, escritura)
   14. Fondo: constelación animada (#net)
   15. Arranque

   Nota: las claves de `vistas` y `acciones`, los atributos data-a, los ids, las clases
   CSS y los nombres de campos guardados (p, u, step, done, sc, sk, h, e, a, ov…) forman
   parte del formato de datos y del HTML: no se deben renombrar.
   ========================================================== */

/* ---------- 1. ESTADO, ALMACENAMIENTO Y SINCRONIZACIÓN ---------- */
/** Escalas de tamaño de texto disponibles (A− / A+), aplicadas como variable CSS --u. */
const ESCALAS_TEXTO = [0.9, 1, 1.1, 1.25];
/** Clave de localStorage donde se guarda todo el estado de la app. */
const CLAVE_ALMACEN = "sofia-2";
/** Estado persistido: p = perfiles, u = escala de texto, rs/ex = recursos, teacherCodes = códigos emitidos. */
let estado;
try {
  estado = JSON.parse(localStorage.getItem(CLAVE_ALMACEN));
} catch (e) {}
estado = estado || { p: {}, u: 1 };
estado.rs = estado.rs || {};
estado.ex = estado.ex || {};
estado.teacherCodes = estado.teacherCodes || {};
/** Nombre de la marca que se muestra en la interfaz y en los informes. */
const BRAND = "SOPHIALAP";
/** Ruta del logotipo. */
const LOGO = "assets/logo.png";
/** Mensaje que se usa cuando no hay servidor de sincronización. */
const NO_SERVER =
  "El servidor de sincronización no está disponible en esta versión. Tu progreso se guarda en este dispositivo.";
/** true cuando se detecta que no hay API: la app trabaja solo en este dispositivo. */
let LOCAL_ONLY = false;
/** Estado visible de la sincronización (syncing, synced, offline, error, local). */
let syncState = "syncing";
/** Texto que acompaña al indicador de sincronización. */
let syncMessage = "Conectando…";
/** Último código personal emitido (se muestra para copiarlo). */
let issuedCode = "";
/** Nombre del estudiante al que pertenece issuedCode. */
let issuedCodeName = "";
/** Deja de mostrar el último código personal emitido (al borrar datos, quitar un estudiante o salir del panel). */
const olvidarCodigoMostrado = () => {
  issuedCode = "";
  issuedCodeName = "";
};
/** Lista de estudiantes descargada para el panel docente. */
let teacherRoster = [];
/** Recursos compartidos que guarda el docente en la nube. */
let teacherSettings = { resources: {}, extraResources: {} };
/** true cuando ya se cargaron los datos del panel docente. */
let teacherReady = false;
/** Error al cargar el panel docente (se muestra en el acceso). */
let teacherLoadError = "";
/** true mientras se abre un perfil con código personal. */
let accessBusy = false;
/** Clave local de un perfil: la de la nube si existe; si no, nombre normalizado + grado. */
const profileKey = (perfil) =>
  perfil._localKey ||
  String(perfil.name || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") +
    "|" +
    perfil.grade;
/** Extrae del perfil solo los datos de progreso que se envían al servidor. */
const progressOf = (perfil) => ({
  name: String(perfil.name || "Estudiante").slice(0, 120),
  grade: String(perfil.grade),
  u: perfil.u || {},
});
/** Genera un identificador único del cliente (usa crypto.randomUUID si existe). */
const clientUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (caracter) => {
    const aleatorio = (Math.random() * 16) | 0;
    return (caracter === "x" ? aleatorio : (aleatorio & 3) | 8).toString(16);
  });
};
/* ---------- 1b. CONEXIÓN CON SUPABASE (base de datos) ----------
   El sitio se publica en GitHub Pages (solo archivos estáticos). Los datos compartidos
   (estudiantes, notas, recursos y sesión docente) viven en Supabase y se consultan con
   funciones RPC de PostgreSQL (ver supabase/schema.sql). La clave "publishable" es pública
   por diseño: las tablas no se pueden leer directamente y cada función valida el código
   personal del estudiante o el token de sesión del docente. */
/** URL del proyecto de Supabase. Si se deja vacía, la app trabaja en modo local. */
const SUPABASE_URL = "https://qlqpfpirdscqhsxkafio.supabase.co";
/** Clave pública (publishable) del proyecto de Supabase. */
const SUPABASE_KEY = "sb_publishable_zzffObHTO_5G7vvRo7ciKQ_FXZLqx-c";
/** Clave de localStorage donde se guarda el token de la sesión docente (expira en 8 h en el servidor). */
const CLAVE_TOKEN_DOCENTE = "sophialap-docente";
/** Lee el token de sesión docente guardado en este navegador. */
const leerTokenDocente = () => {
  try {
    return localStorage.getItem(CLAVE_TOKEN_DOCENTE) || "";
  } catch (e) {
    return "";
  }
};
/** Guarda (o borra, si es vacío) el token de sesión docente. */
const guardarTokenDocente = (token) => {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN_DOCENTE, token);
    else localStorage.removeItem(CLAVE_TOKEN_DOCENTE);
  } catch (e) {}
};
/** Ejecuta una función RPC de Supabase y devuelve su resultado JSON (o lanza un Error con el mensaje del servidor). */
const rpc = async (funcion, parametros = {}) => {
  let respuesta;
  try {
    respuesta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
      },
      body: JSON.stringify(parametros),
    });
  } catch (e) {
    throw new Error(
      navigator.onLine
        ? "No fue posible conectar con el servidor."
        : "Sin conexión. El progreso sigue guardado en este dispositivo.",
    );
  }
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch (e) {}
  if (!respuesta.ok) {
    throw new Error((datos && (datos.message || datos.error)) || `Error del servidor (${respuesta.status}).`);
  }
  return datos;
};
/**
 * Puerta única hacia el servidor. Conserva las rutas tipo REST que usa el resto de la app
 * (/api/sofia/...) y las traduce a la función RPC de Supabase correspondiente.
 */
const api = async (path, options = {}) => {
  if (LOCAL_ONLY || !SUPABASE_URL) {
    LOCAL_ONLY = true;
    throw new Error(NO_SERVER);
  }
  const metodo = (options.method || "GET").toUpperCase();
  const cuerpo = options.body ? JSON.parse(options.body) : {};
  const partes = path.replace(/^\/api\/sofia\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = partes;
  const token = leerTokenDocente();
  const ruta = `${metodo} ${a || ""}/${b ? (c ? "*/" + c : b) : ""}`;
  switch (ruta) {
    case "GET auth/session":
      return token ? rpc("teacher_session", { p_token: token }) : { authenticated: false };
    case "POST auth/login": {
      const sesion = await rpc("teacher_login", { p_user: cuerpo.user, p_password: cuerpo.password });
      guardarTokenDocente(sesion.token);
      return { authenticated: true };
    }
    case "POST auth/logout":
      if (token) await rpc("teacher_logout", { p_token: token });
      guardarTokenDocente("");
      return { authenticated: false };
    case "POST students/":
      return rpc("student_register", {
        p_name: cuerpo.name,
        p_grade: String(cuerpo.grade),
        p_client_id: cuerpo.clientId || null,
        p_progress: cuerpo.progress || {},
      });
    case "POST students/access":
      return rpc("student_access", { p_code: cuerpo.accessCode });
    case "PUT students/*/progress": {
      const codigo = ((options.headers && options.headers.Authorization) || "").replace(/^Bearer\s+/i, "");
      return rpc("student_save_progress", { p_id: decodeURIComponent(b), p_code: codigo, p_progress: cuerpo.progress });
    }
    case "GET teacher/students":
      return rpc("teacher_list_students", { p_token: token });
    case "POST teacher/students":
      return rpc("teacher_create_student", { p_token: token, p_name: cuerpo.name, p_grade: String(cuerpo.grade) });
    case "GET teacher/settings":
      return rpc("teacher_get_settings", { p_token: token });
    case "PUT teacher/settings":
      return rpc("teacher_put_settings", {
        p_token: token,
        p_resources: cuerpo.resources || {},
        p_extra: cuerpo.extraResources || {},
      });
    default:
      break;
  }
  // Rutas con id: teacher/students/:id (PUT edita, DELETE elimina)
  if (a === "teacher" && b === "students" && c) {
    const id = decodeURIComponent(c);
    if (metodo === "PUT") return rpc("teacher_update_student", { p_token: token, p_id: id, p_progress: cuerpo.progress });
    if (metodo === "DELETE") return rpc("teacher_delete_student", { p_token: token, p_id: id });
  }
  throw new Error("Operación no disponible.");
};
/** Actualiza el estado de sincronización y el indicador de la cabecera sin re-renderizar. */
const setSync = (state, message) => {
  if (LOCAL_ONLY) {
    state = "local";
    message = "Guardado en este dispositivo";
  }
  syncState = state;
  syncMessage = message;
  const indicador = $("#sync-status");
  if (indicador) {
    indicador.dataset.state = state;
    indicador.setAttribute("aria-label", "Estado de sincronización: " + message);
    indicador.innerHTML = `<i class=sync-dot aria-hidden=true></i><span>${escaparHTML(message)}</span>`;
  }
};
/** Indica si el perfil es el usuario activo y sigue guardado en el estado. */
const profileIsCurrent = (perfil) =>
  !!perfil && usuario === perfil && estado.p[profileKey(perfil)] === perfil;
/** Temporizador del guardado diferido en la nube. */
let saveTimer = 0;
/** Perfil con cambios pendientes de enviar a la nube. */
let pendingProfile = null;
/** Guarda el estado completo en localStorage (ignora errores de almacenamiento). */
const persist = () => {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(estado));
  } catch (e) {}
};
/** Muestra un diálogo modal con el código personal del perfil para copiarlo. */
const showIssuedCode = (name, code) => {
  issuedCode = code;
  issuedCodeName = name;
  const anterior = document.querySelector("[data-code-dialog]");
  if (anterior) anterior.remove();
  const contenedorApp = $("#app");
  const capa = document.createElement("div");
  capa.dataset.codeDialog = "true";
  capa.setAttribute("role", "dialog");
  capa.setAttribute("aria-modal", "true");
  capa.setAttribute("aria-labelledby", "code-title");
  capa.style.cssText =
    "position:fixed;inset:0;z-index:25;background:#000b;display:grid;place-items:center;padding:16px";
  capa.innerHTML =
    `<section class=card style="width:min(100%,500px);margin:0;background:var(--surface)">` +
    `<p class=ey>Perfil listo para otros dispositivos</p>` +
    `<h2 id=code-title>Código personal · ${escaparHTML(name)}</h2>` +
    `<p class=mut>Guarda este código. Solo con él se puede abrir y sincronizar este perfil.</p>` +
    `<div class=code-box><code>${escaparHTML(code)}</code>` +
    `</div><p class=mut data-copy-note aria-live=polite>` +
    `</p><button class=btn data-copy-now>Copiar código</button>` +
    `<button class=b2 data-close-code>Continuar</button>` +
    `</section>`;
  document.body.appendChild(capa);
  contenedorApp.inert = true;
  /** Cierra el diálogo y devuelve la interactividad a la app. */
  const cerrar = () => {
    capa.remove();
    contenedorApp.inert = false;
  };
  capa.querySelector("[data-copy-now]").onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      capa.querySelector("[data-copy-note]").textContent = "Código copiado.";
    } catch (e) {
      capa.querySelector("[data-copy-note]").textContent =
        "No se pudo copiar automáticamente. Selecciona y copia el código.";
    }
  };
  capa.querySelector("[data-close-code]").onclick = cerrar;
  capa.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    }
  });
  capa.querySelector("[data-copy-now]").focus();
};
/** Registra un perfil local en la nube y guarda su id y código de acceso. */
const registerProfile = async (perfil) => {
  const claveAnterior = Object.keys(estado.p).find((clave) => estado.p[clave] === perfil);
  if (!perfil.clientId) perfil.clientId = clientUUID();
  setSync("syncing", "Migrando estudiante…");
  persist();
  const resultado = await api("/api/sofia/students", {
    method: "POST",
    body: JSON.stringify({
      name: perfil.name,
      grade: String(perfil.grade),
      clientId: perfil.clientId,
      progress: progressOf(perfil),
    }),
  });
  perfil.cloudId = resultado.student.id;
  perfil._localKey = "cloud:" + resultado.student.id;
  if (claveAnterior && claveAnterior !== perfil._localKey) {
    delete estado.p[claveAnterior];
    estado.p[perfil._localKey] = perfil;
  }
  perfil.accessCode = resultado.accessCode;
  perfil._cloudDirty = false;
  persist();
  if (profileIsCurrent(perfil)) showIssuedCode(perfil.name, resultado.accessCode);
  else if (vistaActual === "home") render();
  setSync("synced", "Sincronizado");
  return resultado;
};
/** Envía el progreso del perfil a la nube (o lo registra si aún no existe allí). */
const flushProfile = async (perfil) => {
  if (!perfil) return;
  if (LOCAL_ONLY) {
    setSync("local", "");
    return;
  }
  if (!navigator.onLine) {
    setSync("offline", "Sin conexión · guardado local");
    return;
  }
  if (!perfil.cloudId || !perfil.accessCode) {
    try {
      await registerProfile(perfil);
    } catch (e) {
      setSync("error", e.message);
      return;
    }
  } else {
    try {
      setSync("syncing", "Sincronizando…");
      await api(`/api/sofia/students/${encodeURIComponent(perfil.cloudId)}/progress`, {
        method: "PUT",
        headers: { Authorization: "Bearer " + perfil.accessCode },
        body: JSON.stringify({ progress: progressOf(perfil) }),
      });
      perfil._cloudDirty = false;
      persist();
      setSync("synced", "Sincronizado");
    } catch (e) {
      setSync(navigator.onLine ? "error" : "offline", e.message);
    }
  }
};
/** Programa la sincronización del perfil con una espera de 750 ms. */
const scheduleProfileSync = (perfil) => {
  if (!perfil || !profileIsCurrent(perfil)) return;
  pendingProfile = perfil;
  perfil._cloudDirty = true;
  persist();
  clearTimeout(saveTimer);
  setSync(
    navigator.onLine ? "syncing" : "offline",
    navigator.onLine ? "Cambios pendientes…" : "Sin conexión · guardado local",
  );
  saveTimer = setTimeout(async () => {
    const objetivo = pendingProfile;
    pendingProfile = null;
    await flushProfile(objetivo);
  }, 750);
};
/** Guarda en local y, si hay usuario activo, programa su sincronización. */
const save = () => {
  persist();
  if (profileIsCurrent(usuario)) scheduleProfileSync(usuario);
};
/** Sube a la nube los perfiles locales pendientes o que nunca se registraron. */
const migrateLocalProfiles = async () => {
  const perfiles = Object.values(estado.p).filter(
    (perfil) => perfil && perfil.name && ["10", "11"].includes(String(perfil.grade)),
  );
  const pendientes = perfiles.filter((perfil) => perfil._cloudDirty && perfil.cloudId && perfil.accessCode);
  const sinNube = perfiles.filter((perfil) => !perfil.cloudId || !perfil.accessCode);
  for (const perfil of pendientes.concat(sinNube)) {
    if (!navigator.onLine) {
      setSync("offline", "Sin conexión · guardado local");
      return;
    }
    try {
      await flushProfile(perfil);
    } catch (e) {
      setSync("error", e.message);
      return;
    }
  }
  if (!pendientes.length && !sinNube.length && navigator.onLine) setSync("synced", "Listo para sincronizar");
};
addEventListener("online", () => {
  if (pendingProfile) flushProfile(pendingProfile);
  else migrateLocalProfiles();
});

/* ---------- 2. UTILIDADES ---------- */
/** Atajo de document.querySelector. */
const $ = (selector) => document.querySelector(selector);
/** Escapa &, <, > y comillas dobles para insertar texto en HTML. */
const escaparHTML = (texto) =>
  String(texto).replace(
    /[&<>"]/g,
    (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caracter],
  );
/** Devuelve una copia barajada del arreglo (Fisher–Yates). */
const barajar = (lista) => {
  lista = [...lista];
  for (let i = lista.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
};
/** Región aria-live para anuncios del lector de pantalla. */
const regionAnuncios = $("#live");
/** Expresión para partir texto alrededor de emojis/flechas (con grupo de captura). */
const RE_EMOJI_PARTIR = /([\p{Extended_Pictographic}←→↗⬇✎]\uFE0F?)/u;
/** Expresión global para quitar emojis/flechas de los anuncios. */
const RE_EMOJI = /[\p{Extended_Pictographic}←→↗⬇✎]\uFE0F?/gu;
/** Selector del título de la primera tarjeta (destino del foco al cambiar de paso). */
const SELECTOR_TITULO_TARJETA = "#app main .card h2";
/** Selector del elemento que recibirá el foco en el próximo render. */
let focoPendiente = null;
/** Anuncia un texto al lector de pantalla (sin etiquetas ni emojis). */
const announce = (texto) => {
  if (!regionAnuncios) return;
  regionAnuncios.textContent = "";
  setTimeout(() => {
    regionAnuncios.textContent = String(texto)
      .replace(/<[^>]*>/g, "")
      .replace(RE_EMOJI, "")
      .replace(/\s+/g, " ")
      .trim();
  }, 60);
};
/** HTML del bloque de retroalimentación o pista actual (vacío si no hay). */
const bloqueRetroalimentacion = () =>
  retroalimentacion
    ? `<div class="fb ${retroalimentacion.k === "hint" ? "hint" : ""}" id=fbk tabindex=-1 role=group aria-labelledby=fbkt>` +
      `<h3 id=fbkt>${retroalimentacion.t}</h3><p>${retroalimentacion.x}</p></div>`
    : "";
/** Contador de caracteres del modo escritura (Dilema y Creación). */
const contadorCaracteres = (id, valor, minimo) => {
  const largo = (valor || "").length;
  return (
    `<p class="count ${largo >= minimo ? "is-ok" : ""}" id=cnt-${id} data-min=${minimo}>` +
    `<span class=count__n>${largo} / ${minimo} caracteres</span>` +
    `<span class="count__saved ${largo ? "on" : ""}">Guardado ✓</span>` +
    `</p>`
  );
};
/** Atributos que deshabilitan «Continuar» con el motivo según el paso actual. */
const atributosBloqueo = () =>
  'aria-disabled=true data-hint="' +
  ({
    2: "Responde todas las preguntas para continuar.",
    3: "Responde todas las preguntas para continuar.",
    4: "Elige una postura y completa las dos respuestas con el mínimo de caracteres.",
    5: "Escribe el mínimo de caracteres para continuar.",
  }[progresoPeriodo(periodoActual).step] || "Completa la actividad para continuar.") +
  '"';
/** Barra de progreso accesible (valor de 0 a 100). */
const barraProgreso = (valor, etiqueta) =>
  `<div class=bar role=progressbar aria-valuemin=0 aria-valuemax=100 aria-valuenow=${Math.round(valor)} aria-label="${etiqueta}">` +
  `<i style="width:${valor}%"></i></div>`;
/** Cabecera: marca, tamaño de texto, acceso docente y estado de sincronización. */
const cabecera = () => {
  const indiceEscala = ESCALAS_TEXTO.indexOf(estado.u);
  return (
    `<header class=top><div class=brand-group>` +
    `<button class=brand data-a=cover aria-label="Ir a la portada · ${BRAND}">` +
    `<img src="${LOGO}" width=35 height=44 alt="Logotipo de SOPHIALAP: escudo violeta y dorado con una columna jónica">` +
    `<span>${BRAND}</span></button><p class=tag>OVA · Fundamentos de Algoritmia</p>` +
    `</div><div class=tools role=group aria-label="Tamaño del texto y acceso docente">` +
    (`<button data-a=sz data-i=-1 aria-label="Texto más pequeño" ` +
      (indiceEscala < 1 ? 'aria-disabled=true data-hint="El texto ya está en el tamaño mínimo."' : "") +
      `>A−</button>`) +
    (`<span>${Math.round(estado.u * 100)}%</span>` +
      `<button data-a=sz data-i=1 aria-label="Texto más grande" ` +
      (indiceEscala >= ESCALAS_TEXTO.length - 1
        ? 'aria-disabled=true data-hint="El texto ya está en el tamaño máximo."'
        : "") +
      `>A+</button>`) +
    `<button data-a=doc>🔐 Docente</button><span id=sync-status class=sync-line data-state="${syncState}" role=status aria-live=polite aria-label="Estado de sincronización: ${escaparHTML(syncMessage)}">` +
    `<i class=sync-dot aria-hidden=true></i><span>${escaparHTML(syncMessage)}</span>` +
    `</span></div></header>`
  );
};
/** Pie de página visible en todas las vistas (autores, grupo y universidad). */
const pie = () =>
  `<footer class=pie><p class=pie__autores>` +
  `<strong>Autores:</strong> Alejandro Ciro, Ana Vega y Juan Parra</p>` +
  `<p class=pie__grupo>Grupo · Fundamentos de Algoritmia · Licenciatura en Informática y Medios Audiovisuales, Universidad de Córdoba</p>` +
  `<p class=pie__anio>© 2026</p></footer>`;
/** Contador animado de notas: 1.0 → valor final en ~900 ms (ease-out); sin animación si se reduce el movimiento. */
const countUp = (elemento) => {
  const valorFinal = parseFloat(elemento.dataset.count);
  if (!(valorFinal >= 1)) return;
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) {
    elemento.textContent = valorFinal.toFixed(1);
    return;
  }
  const t0 = performance.now();
  const duracion = 900;
  /** Fotograma de la animación del contador. */
  const paso = (ahora) => {
    const progreso = Math.min(1, (ahora - t0) / duracion);
    const suavizado = 1 - Math.pow(1 - progreso, 3);
    elemento.textContent = (1 + (valorFinal - 1) * suavizado).toFixed(1);
    if (progreso < 1 && elemento.isConnected) requestAnimationFrame(paso);
  };
  elemento.textContent = "1.0";
  requestAnimationFrame(paso);
};
/** Lanza confeti al acertar o terminar (no se ejecuta si se reduce el movimiento). */
const lanzarConfeti = () => {
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  for (let i = 0; i < 34; i++) {
    const particula = document.createElement("i");
    particula.className = "cf";
    const angulo = Math.random() * 6.28;
    const distancia = 120 + Math.random() * 220;
    particula.style.cssText = `--dx:${Math.cos(angulo) * distancia}px;--dy:${Math.sin(angulo) * distancia + 90}px;background:${["#f5c451", "#ffe29a", "#8b5cf6", "#c4b5fd"][i % 4]}`;
    document.body.appendChild(particula);
    setTimeout(() => particula.remove(), 1600);
  }
};
/* ---------- 3. DATOS DEL CURSO (PERIODOS) ---------- */
/** Recursos generales del curso (referencia; no se usan en la interfaz). */
const RECURSOS_GENERALES = [
  [
    "📄",
    "MEN · Orientaciones pedagógicas para la Filosofía (Documento 14)",
    "https://www.mineducacion.gov.co/1621/article-241891.html",
  ],
  [
    "🔗",
    "Colombia Aprende · recursos educativos",
    "https://www.colombiaaprende.edu.co/recursos-de-coleccion",
  ],
];
/** Contenido de cada periodo por grado: t título, q pregunta, rx recursos, th teoría, ex ejemplo, xp explicación, an/ai/o/g actividad de ordenar, v verdadero/falso, d dilema, c creación. */
const PERIODOS = {
  10: [
    {
      t: "¿Para qué sirve la filosofía?",
      q: "¿Qué diferencia hay entre opinar y conocer?",
      rx: [
        [
          "📄",
          "Enciclopedia Humanidades · ¿Para qué sirve la filosofía?",
          "https://humanidades.com/para-que-sirve-la-filosofia/",
        ],
        [
          "📊",
          "uDocz · Cuadro comparativo de la filosofía clásica (pide registro gratuito)",
          "https://www.udocz.com/apuntes/280668/cuadro-comparativo-filosofia-clasica",
        ],
        [
          "🎬",
          "Educatina · Qué es la Filosofía (resumen del video)",
          "https://videohighlight.com/v/HxpgVhX59F4",
        ],
      ],
      th: [
        "La filosofía nació en Grecia cuando algunos pensadores empezaron a explicar el mundo con razones (logos) y no solo con mitos. Su punto de partida es el asombro: preguntarse por lo que damos por obvio. Tradicionalmente se recuerda a Tales de Mileto como uno de los primeros, seguido por Sócrates, Platón y Aristóteles; siglos después, Descartes inauguró la filosofía moderna.",
        "Los griegos distinguían la doxa (opinión o creencia, que puede ser un error) de la episteme (conocimiento fundamentado). Filosofar es examinar nuestras opiniones y apoyarlas en las mejores razones.",
      ],
      ex: "Decir “esa marca de celular es la mejor” es una opinión. Se vuelve conocimiento cuando la sustentas con criterios y datos, y la comparas con otras razones.",
      xp: "Aprender filosofía no es memorizar autores: es aprender a preguntar, argumentar y dialogar. Por eso trabajamos tres competencias: crítica, dialógica y creativa.",
      an: "Línea de tiempo de la filosofía",
      ai: "Ordena de la más antigua a la más reciente.",
      o: [
        "Tales de Mileto, uno de los primeros en buscar explicaciones racionales",
        "Sócrates",
        "Platón",
        "Aristóteles",
        "Descartes, inicio de la filosofía moderna",
      ],
      v: [
        [
          "Una opinión es conocimiento si mucha gente la comparte.",
          false,
          "Que muchos la compartan no la fundamenta: la episteme exige razones.",
        ],
        [
          "La filosofía nace del asombro y de preguntar por lo obvio.",
          true,
          "Es el punto de partida del filosofar.",
        ],
        [
          "Filosofar consiste en memorizar lo que dijeron los filósofos.",
          false,
          "Consiste en examinar razones y pensar por cuenta propia.",
        ],
      ],
      d: [
        "Un amigo comparte en redes que “el agua con limón cura todo”. ¿Qué haces?",
        "Lo comparto: a él le funcionó",
        "Le pido fuentes y razones antes de creerlo",
      ],
      c: "Escribe una pregunta filosófica sobre algo que normalmente das por obvio y explica por qué te intriga.",
    },
    {
      t: "Teoría del conocimiento",
      q: "¿Qué podemos conocer con certeza?",
      rx: [
        [
          "🎬",
          "Educatina · David Hume: aproximación a su teoría del conocimiento",
          "https://www.youtube.com/watch?v=wnpGmg8a760",
        ],
        [
          "📊",
          "Academia.edu · Infografía: Conocimiento y ciencia (pide registro para descargar)",
          "https://www.academia.edu/124081676/_Infograf%C3%ADa_Conocimiento_y_Ciencia",
        ],
        [
          "📊",
          "Docsity · Infografía sobre la teoría del conocimiento",
          "https://www.docsity.com/es/infografia-sobre-la-teoria-del-conocimiento/8770871/",
        ],
      ],
      th: [
        "El racionalismo de Descartes busca una certeza indudable: con la duda metódica descubre que no puede dudar de que piensa (“pienso, luego existo”). El empirismo de Locke y Hume sostiene que el conocimiento nace de la experiencia.",
        "Kant propone una síntesis: conocemos lo que la experiencia nos da, organizado por las formas de nuestra mente. Por eso nuestro conocimiento tiene límites.",
      ],
      ex: "Ves un lápiz que parece doblado dentro de un vaso con agua: la experiencia te engaña. Para saber cómo es en realidad, usas la razón y otras pruebas.",
      xp: "Racionalismo: la razón es la fuente principal. Empirismo: la experiencia. Kant: se necesitan ambas.",
      an: "Ordena la duda de Descartes",
      ai: "Ordena los pasos del razonamiento de Descartes.",
      o: [
        "Dudo de lo que creía seguro",
        "Busco algo que resista toda duda",
        "Descubro que dudar ya es pensar",
        "Concluyo: pienso, luego existo",
        "Uso esa certeza como base para otros conocimientos",
      ],
      v: [
        [
          "Para los empiristas el conocimiento comienza en la experiencia.",
          true,
          "Locke y Hume parten de lo que percibimos.",
        ],
        [
          "Descartes aceptaba como verdadero todo lo que veía con los ojos.",
          false,
          "Dudó incluso de los sentidos.",
        ],
        [
          "Para Kant bastan la razón o la experiencia por separado.",
          false,
          "Kant sostiene que ambas se necesitan.",
        ],
      ],
      d: [
        "Tu amigo asegura: “Solo creo lo que veo”. ¿Es un buen criterio?",
        "Sí: la experiencia es la única fuente confiable",
        "No: también hay que razonar y contrastar",
      ],
      c: "Inventa un ejemplo cotidiano en el que la experiencia te engañe y explica cómo la razón lo corrige.",
    },
    {
      t: "Filosofía de la ciencia",
      q: "¿Por qué confiamos en la ciencia?",
      rx: [
        ["🎬", "Martín Lillo · Ciencia: Popper y Kuhn", "https://www.youtube.com/watch?v=a092s_aY_Bc"],
        [
          "📊",
          "SlideShare · Infografía: Filosofía de las ciencias",
          "https://es.slideshare.net/slideshow/infografia-filosofia-de-las-ciencias/250323132",
        ],
        [
          "📊",
          "Genially · Infografía: la filosofía de la ciencia en el siglo XX",
          "https://view.genially.com/6737f5063a70308634091316/interactive-content-infografia-la-filosofia-de-la-ciencia-en-el-siglo-xx",
        ],
      ],
      th: [
        "Bacon propuso limpiar la mente de “ídolos”: prejuicios que distorsionan lo que conocemos, como los del lenguaje o la costumbre. Hoy los vemos en los sesgos y la desinformación.",
        "Popper planteó que una teoría es científica si puede ser refutada (falsación). Kuhn mostró que la ciencia avanza por paradigmas que a veces se reemplazan en revoluciones científicas.",
      ],
      ex: "“Todos los cisnes son blancos” parece cierta, pero un solo cisne negro la refuta. Por eso la ciencia somete sus teorías a prueba.",
      xp: "Confiar en la ciencia no es creer a ciegas: es confiar en un método que se critica y se corrige en comunidad.",
      an: "Ordena el método científico",
      ai: "Ordena los pasos del método, de la observación a la revisión.",
      o: [
        "Observo un fenómeno",
        "Formulo una hipótesis",
        "Diseño una prueba que podría refutarla",
        "Veo si resiste o se refuta",
        "La comunidad revisa y corrige la teoría",
      ],
      v: [
        ["Para Popper una teoría científica debe poder ser refutada.", true, "Es el criterio de falsación."],
        [
          "Los “ídolos” de Bacon son prejuicios que distorsionan el conocimiento.",
          true,
          "Por eso propone purgarlos.",
        ],
        [
          "Para Kuhn la ciencia avanza solo acumulando datos, sin cambios bruscos.",
          false,
          "Habló de revoluciones científicas entre paradigmas.",
        ],
      ],
      d: [
        "Circula un video viral con un “remedio milagroso” sin fuentes. ¿Qué haces?",
        "Confío: tiene miles de vistas",
        "Verifico las fuentes y busco cómo podría refutarse",
      ],
      c: "Escribe tres preguntas que harías para saber si una noticia es confiable y explica por qué.",
    },
    {
      t: "Lógica y argumentación",
      q: "¿Cómo sé si un argumento es bueno?",
      rx: [
        [
          "🎬",
          "TeoCom · ¿Qué son las falacias? Explicación fácil con ejemplos",
          "https://www.youtube.com/watch?v=44XeNCfHpLw",
        ],
        [
          "📄",
          "Lifeder · Argumentar y demostrar (cuadro comparativo y ejemplos)",
          "https://www.lifeder.com/argumentar-y-demostrar/",
        ],
      ],
      th: [
        "Un argumento tiene premisas (razones) y una conclusión que se sigue de ellas. Es sólido si las premisas son aceptables y la conclusión realmente se deriva.",
        "Las falacias son razonamientos engañosos: el ataque personal (ad hominem), apelar a la mayoría o a la autoridad, o la falsa dicotomía. Un buen diálogo exige razones coherentes, aceptar los mejores argumentos y escuchar al otro.",
      ],
      ex: "“No le hagas caso, es joven” ataca a la persona y no a su argumento: es un ad hominem.",
      xp: "Argumentar bien no es ganar la discusión, es buscar entre todos la mejor razón.",
      an: "Reconstruye el argumento",
      ai: "Coloca las premisas y la conclusión. Las premisas pueden ir en cualquier orden; la conclusión va al final.",
      g: [0, 0, 0, 1],
      o: [
        "Premisa: una falacia hace que un argumento sea débil",
        "Premisa: atacar a la persona y no a sus razones es una falacia (ad hominem)",
        "Premisa: “No le hagas caso, es joven” ataca a la persona y no a su argumento",
        "Conclusión: “No le hagas caso, es joven” es un argumento débil",
      ],
      v: [
        ["Atacar a quien habla en lugar de su argumento es una falacia.", true, "Se llama ad hominem."],
        [
          "Si muchas personas lo creen, el argumento es válido.",
          false,
          "Es la falacia de apelar a la mayoría.",
        ],
        [
          "Un buen diálogo exige escuchar y aceptar los mejores argumentos.",
          true,
          "Es condición del diálogo filosófico.",
        ],
      ],
      d: [
        "En un debate alguien dice: “Tu postura es absurda porque eres muy joven”. ¿Cómo respondes?",
        "Lo ataco yo también",
        "Señalo la falacia y vuelvo a mis razones",
      ],
      c: "Escribe un argumento con tres premisas y una conclusión sobre un tema de tu colegio.",
    },
  ],
  11: [
    {
      t: "Estética",
      q: "¿Qué hace que algo sea bello o arte?",
      rx: [
        [
          "📊",
          "Docsity · Infografía: conceptos de estética",
          "https://www.docsity.com/es/infografia-conceptos-de-esteticas/8313106/",
        ],
        [
          "🔬",
          "Revista Ciencia (AMC) · Investigaciones estéticas (artículo científico)",
          "https://www.revistaciencia.amc.edu.mx/images/revista/53_4/investigaciones_esteticas.pdf",
        ],
      ],
      th: [
        "La estética reflexiona sobre la belleza, el arte y la experiencia sensible. Platón desconfiaba del arte por ser imitación de la realidad; Aristóteles, en cambio, valoraba su poder de purificar emociones (catarsis).",
        "Kant sostuvo que el juicio de gusto es subjetivo, pero pretende ser compartido: decimos “es bello” esperando que otros coincidan. Hoy el arte se mezcla con la cultura de masas y las redes, y la pregunta sigue abierta: ¿quién decide qué es arte?",
      ],
      ex: "Un grafiti en un muro puede ser vandalismo para unos y arte urbano para otros. Discutir por qué es filosofar sobre la estética.",
      xp: "La estética no busca una única definición de belleza, sino razones para sostener nuestros juicios sobre el arte.",
      an: "Línea de tiempo de la estética",
      ai: "Ordena de la idea más antigua a la más reciente.",
      o: [
        "Platón desconfía del arte por ser imitación de la realidad",
        "Aristóteles destaca el poder del arte para purificar emociones (catarsis)",
        "Kant analiza el juicio de gusto",
        "El arte se mezcla con la cultura de masas",
        "Las redes reabren la pregunta: ¿quién decide qué es arte?",
      ],
      v: [
        [
          "Para Kant decir “esto es bello” es solo una opinión sin pretensión de acuerdo con otros.",
          false,
          "Kant sostiene que el juicio de gusto pretende ser compartido.",
        ],
        [
          "Aristóteles destacó que el arte puede provocar catarsis, una purificación de emociones.",
          true,
          "Es la idea de catarsis.",
        ],
        [
          "La estética solo estudia las obras de museo.",
          false,
          "También estudia la experiencia de lo bello en la vida cotidiana y en la cultura de masas.",
        ],
      ],
      d: [
        "Un compañero dice que un meme y un cuadro famoso valen lo mismo como arte. ¿Qué piensas?",
        "Los dos pueden ser arte si comunican y generan experiencia",
        "Solo es arte lo que exige técnica y tradición",
      ],
      c: "Elige una obra, canción o imagen que consideres valiosa y sustenta con razones, no solo con gusto, por qué lo es.",
    },
    {
      t: "Ética",
      q: "¿Qué significa actuar bien?",
      rx: [
        [
          "📊",
          "MilFormatos · Cuadro comparativo de ética y moral",
          "https://milformatos.com/escolares/cuadro-comparativo-de-etica-y-moral/",
        ],
        [
          "📊",
          "SlideShare · Cuadro comparativo de ética",
          "https://es.slideshare.net/slideshow/cuadro-comparativo-de-etica/44624215",
        ],
      ],
      th: [
        "La ética reflexiona sobre cómo debemos actuar. Aristóteles propone la ética de la virtud: actuar bien es formar un carácter virtuoso, buscando el término medio entre extremos (el valor está entre la cobardía y la temeridad).",
        "Kant defiende una ética del deber: una acción es moral si podría convertirse en ley universal. El utilitarismo de Bentham y Mill evalúa las acciones por sus consecuencias: es correcto lo que produce el mayor bienestar para el mayor número de personas. Para comprobar si una acción es moral, Kant propone identificar la regla con la que se actúa, imaginar que todas las personas actuaran así y ver si esa regla puede sostenerse sin contradecirse.",
      ],
      ex: "Encuentras una billetera con dinero. Aristóteles preguntaría qué haría una persona honesta; Kant, si podrías querer que todos se la queden; el utilitarismo, qué produce mejores consecuencias para todos.",
      xp: "Tres lentes para decidir: el carácter (virtud), el deber (norma universal) y las consecuencias (utilidad).",
      an: "Ordena la prueba de Kant",
      ai: "Ordena los pasos para comprobar si una acción es moral según Kant.",
      o: [
        "Identifico la regla con la que voy a actuar",
        "Imagino que todas las personas actuaran con esa misma regla",
        "Compruebo si esa regla puede sostenerse como ley universal sin contradecirse",
        "Concluyo si mi acción es moral o no según ese resultado",
      ],
      v: [
        [
          "Para Kant una acción es moral si podría convertirse en ley universal.",
          true,
          "Es el imperativo categórico.",
        ],
        [
          "El utilitarismo evalúa las acciones solo por la intención, sin mirar las consecuencias.",
          false,
          "Evalúa por las consecuencias: el mayor bienestar para el mayor número.",
        ],
        [
          "Aristóteles propone la virtud como un término medio entre extremos.",
          true,
          "Por ejemplo, el valor entre la cobardía y la temeridad.",
        ],
      ],
      d: [
        "Ves que un compañero copia en un examen. ¿Qué haces?",
        "Lo denuncio: la norma debe cumplirse para todos",
        "Hablo primero con él: busco el mejor resultado para todos",
      ],
      c: "Describe un dilema moral real o inventado y analízalo con dos de las tres miradas: virtud, deber o consecuencias.",
    },
    {
      t: "Ética y política",
      q: "¿Qué es una sociedad justa?",
      rx: [
        [
          "📊",
          "Studocu · Infografía: relación entre ética, dignidad y derechos humanos",
          "https://www.studocu.com/co/document/servicio-nacional-de-aprendizaje/derechos-humanos-y-laborales/infografia-relacion-de-etica-dignida-y-ddhh/31562828",
        ],
        [
          "📊",
          "Studocu · Infografía sobre derechos humanos: principios fundamentales",
          "https://www.studocu.com/es-mx/document/pablo-de-villavicencio/civica-y-etica/infografia-sobre-derechos-humanos-principios-fundamentales/130059114",
        ],
      ],
      th: [
        "La filosofía política pregunta cómo debemos vivir juntos. Para Rawls, una sociedad es justa si sus reglas serían aceptadas por todos sin saber qué lugar ocuparían en ella (el “velo de ignorancia”). Como nadie sabe qué lugar ocupará, nadie puede diseñar reglas a su favor y todos eligen reglas imparciales, aceptables para cualquier persona. La democracia exige participación, respeto de los derechos y control del poder.",
        "Los derechos humanos son garantías que toda persona tiene por su dignidad. En Colombia la Constitución de 1991 los reconoce, y reflexionar sobre la violencia, la paz y el diálogo es parte de la formación ciudadana.",
      ],
      ex: "Si debes diseñar las reglas de un colegio sin saber si serás estudiante nuevo, docente o personal de aseo, probablemente buscarías normas justas para todos.",
      xp: "Justicia no es tratar a todos igual en todo, sino garantizar condiciones equitativas y derechos básicos para cada persona.",
      an: "Reconstruye el razonamiento de Rawls",
      ai: "Ordena los pasos del razonamiento del velo de ignorancia.",
      o: [
        "Imagino que no sé qué lugar ocuparé en la sociedad (velo de ignorancia)",
        "Desde esa posición nadie puede diseñar reglas a su favor",
        "Por eso elijo reglas imparciales, aceptables para cualquier persona",
        "Esas reglas imparciales definen una sociedad justa",
      ],
      v: [
        [
          "El velo de ignorancia de Rawls propone elegir reglas sin saber qué posición tendremos en la sociedad.",
          true,
          "Así se buscan reglas imparciales.",
        ],
        [
          "Los derechos humanos dependen de que cada gobierno decida concederlos.",
          false,
          "Se fundamentan en la dignidad de toda persona.",
        ],
        [
          "La democracia se reduce a votar cada cierto tiempo.",
          false,
          "También exige participación, derechos y control del poder.",
        ],
      ],
      d: [
        "Hay un conflicto en tu barrio. ¿Qué camino propones?",
        "Imponer una norma estricta con sanciones",
        "Abrir un diálogo con todas las partes y construir acuerdos",
      ],
      c: "Redacta tres normas para una convivencia justa en tu colegio y explica con qué idea de justicia las defiendes.",
    },
    {
      t: "Pensamiento latinoamericano y proyecto de vida",
      q: "¿Qué sentido le doy a mi vida?",
      rx: [
        [
          "📊",
          "Behance · Infografía: pensamiento latinoamericano",
          "https://www.behance.net/gallery/249110365/Infografia-pensamiento-latinoamericano",
        ],
        [
          "📚",
          "CLACSO · El pensamiento latinoamericano en el siglo XXI (PDF)",
          "https://www.clacso.org/wp-content/uploads/2026/03/El-pensamiento-latinoamericano-siglo-XXI.pdf",
        ],
      ],
      th: [
        "El pensamiento latinoamericano reflexiona desde nuestra realidad: Simón Rodríguez reclamaba una educación propia y Leopoldo Zea se preguntó por la identidad y la liberación de América Latina. Pensar desde aquí implica no limitarnos a repetir ideas importadas.",
        "El existencialismo de Sartre afirma que somos libres y responsables de darle sentido a nuestra vida con nuestras elecciones. Un proyecto de vida combina lo que valoro, lo que puedo hacer y lo que aporto a los demás.",
      ],
      ex: "Elegir una carrera solo por presión o por moda es no hacerse cargo de la propia libertad; elegirla pensando en tus valores y en tu comunidad es construir un proyecto de vida.",
      xp: "Filosofar al final del recorrido es preguntarse quién quiero ser y qué razones sostienen mis decisiones.",
      an: "Reconstruye el argumento existencialista",
      ai: "Ordena el razonamiento, de la premisa inicial a la conclusión.",
      o: [
        "Para Sartre soy libre: nadie decide por mí",
        "Como soy libre, soy responsable de lo que elijo",
        "Mis elecciones le dan sentido a mi vida",
        "Por eso debo construir mi proyecto de vida desde mis valores y mi realidad",
      ],
      v: [
        [
          "Para Sartre somos libres y responsables de dar sentido a nuestra vida.",
          true,
          "Es la idea central de su existencialismo.",
        ],
        [
          "Pensar desde América Latina significa solo repetir las ideas europeas.",
          false,
          "Implica pensar desde nuestra propia realidad.",
        ],
        [
          "Un proyecto de vida puede ignorar lo que valoro y lo que aporto a otros.",
          false,
          "Combina valores, capacidades y aporte a la comunidad.",
        ],
      ],
      d: [
        "Un amigo elige carrera solo porque está de moda. ¿Qué le dices?",
        "Que siga la tendencia: es lo más seguro",
        "Que revise sus valores y talentos antes de decidir",
      ],
      c: "Escribe un microensayo corto: ¿qué sentido quieres darle a tu vida y qué razones filosóficas lo sostienen?",
    },
  ],
};
/* ---------- 4. NOTAS Y CALIFICACIÓN ---------- */
/** Competencias del área (referencia; no se usan en la interfaz). */
const COMPETENCIAS = [
  ["Crítica", "examina razones y fuentes"],
  ["Dialógica", "argumenta y responde a otras posturas"],
  ["Creativa", "formula preguntas y propone ideas propias"],
];
/** Niveles de desempeño, de mayor a menor. */
const NIVELES = ["Superior", "Alto", "Básico", "Bajo"];
/** Complemento de la descripción de cada nivel (mismo orden que NIVELES). */
const SUFIJOS_NIVEL = [
  "de forma autónoma y con ejemplos propios",
  "con pocas ayudas",
  "con apoyo del docente",
  "solo de manera parcial",
];
/** Verbo de la descripción de desempeño según el grado. */
const VERBOS_GRADO = { 10: "Identifica y explica", 11: "Compara, evalúa y sustenta" };
/** Nombres largos de los pasos (referencia; no se usan en la interfaz). */
const NOMBRES_PASOS = ["Teoría", "Arrastrar", "Verdadero o falso", "Dilema", "Creación", "Rúbrica"];
/** Vista activa (clave de `vistas`). */
let vistaActual = "cover";
/** Perfil del estudiante activo. */
let usuario = null;
/** Índice (0–3) del periodo abierto. */
let periodoActual = 0;
/** Valor del campo de nombre en el inicio. */
let nombreFormulario = "";
/** Valor del selector de grado en el inicio. */
let gradoFormulario = "";
/** Mensaje de error que se muestra en el formulario actual. */
let mensajeError = "";
/** Estado de la actividad de ordenar: pool (pasos disponibles) y sl (pasos colocados). */
let estadoOrdenar = null;
/** Retroalimentación o pista visible: {t: título, x: texto, k: tipo}. */
let retroalimentacion = null;
/** Periodos (datos de teoría) del grado del usuario activo. */
const periodosDelGrado = () => PERIODOS[usuario.grade];
/** Progreso del usuario en el periodo i (lo crea vacío si no existe). */
const progresoPeriodo = (indice) =>
  usuario.u[indice] ||
  (usuario.u[indice] = {
    step: 0,
    done: 0,
    e: 0,
    a: {},
    h: [0, 0, 0, 0, 0],
    sc: [null, null, null, null, null, null],
    sk: [0, 0, 0, 0, 0],
  });
/** Indica si el usuario terminó el periodo i. */
const periodoTerminado = (periodo) => !!(usuario.u[periodo] && usuario.u[periodo].done);
/** Mínimo de caracteres de cada respuesta del dilema según el grado. */
const minimoDilema = () => (usuario.grade === "10" ? 40 : 60);
/** Mínimo de caracteres de la creación según el grado. */
const minimoCreacion = () => (usuario.grade === "10" ? 80 : 120);
/** Indica si la actividad del paso actual está completa para poder continuar. */
const actividadCompleta = () => {
  const progreso = progresoPeriodo(periodoActual);
  const paso = progreso.step;
  const dilema = progreso.a.d || {};
  return paso == 2
    ? (progreso.a.v || []).filter((x) => x != null).length == periodosDelGrado()[periodoActual].v.length
    : paso == 3
      ? (progreso.a.q || []).filter((x) => x != null).length == RETOS[usuario.grade][periodoActual].it.length
      : paso == 4
        ? dilema.pos >= 0 &&
          (dilema.arg || "").length >= minimoDilema() &&
          (dilema.obj || "").length >= minimoDilema()
        : paso == 5
          ? (progreso.a.c || "").length >= minimoCreacion()
          : false;
};

/** Peso de cada nota en la nota del periodo (Ordenar, V/F, Reto, Dilema, Creación, Pistas). */
const PESOS = [0.15, 0.15, 0.2, 0.2, 0.2, 0.1];
/** Nombres de las seis notas del periodo (mismo orden que PESOS). */
const NOMBRES_ACTIVIDADES = [
  "Ordenar",
  "Verdadero o falso",
  "Reto del periodo",
  "Dilema",
  "Creación",
  "Pistas",
];
/** Redondea a un decimal. */
const redondear1 = (valor) => Math.round(valor * 10) / 10;
/** Nivel de desempeño que corresponde a una nota de 1.0 a 5.0. */
const nivel = (nota) => (nota >= 4.6 ? "Superior" : nota >= 4 ? "Alto" : nota >= 3 ? "Básico" : "Bajo");
/** 1 mientras el estudiante repasa la teoría desde una actividad. */
let viendoTeoria = 0;
/** Nota de un periodo: la ajustada por el docente (ov) o el promedio ponderado de sus notas. */
const notaPeriodo = (progreso) =>
  typeof progreso.ov === "number"
    ? progreso.ov
    : redondear1(PESOS.reduce((total, peso, i) => total + peso * ((progreso.sc || [])[i] || 1), 0));
/** Nota final del perfil: promedio de los periodos terminados (null si no hay). */
const notaFinal = (perfil) => {
  const terminados = Object.values(perfil.u).filter((progreso) => progreso.done);
  return terminados.length
    ? redondear1(terminados.reduce((total, progreso) => total + notaPeriodo(progreso), 0) / terminados.length)
    : null;
};
/** Nota final con un decimal, o «–» si no hay. */
const notaFinalTexto = (perfil) => (notaFinal(perfil) == null ? "–" : notaFinal(perfil).toFixed(1));
/** Puntaje de la actividad del paso: 5 menos 0.5 por pista y 1 por pregunta fallada (mínimo 1). */
const puntajeActividad = (paso) => {
  const progreso = progresoPeriodo(periodoActual);
  const pistasUsadas = (progreso.h || [])[paso - 1] || 0;
  const respuestas = progreso.a[paso == 2 ? "v" : "q"] || [];
  const fallos = paso == 2 || paso == 3 ? respuestas.filter((x) => x === 2).length : 0;
  return Math.max(1, redondear1(5 - 0.5 * pistasUsadas - fallos));
};
/* ---------- 5. TEORÍA Y RECURSOS ---------- */
/** Recursos de un periodo: [recurso, esExtra (0/1), índice] con los propios y los agregados por el docente. */
const recursosPeriodo = (grado, periodo) => {
  const datosPeriodo = PERIODOS[grado][periodo];
  return (datosPeriodo.rx || [])
    .map((recurso, j) => [recurso, 0, j])
    .concat((estado.ex[grado + "," + periodo] || []).map((recurso, j) => [recurso, 1, j]));
};
/** HTML de la teoría del periodo y sus recursos visibles. */
const vistaTeoria = (datosPeriodo) => {
  const recursos = recursosPeriodo(usuario.grade, periodoActual).filter((x) => !(estado.rs[x[0][2]] || {}).h);
  return (
    `<div class=card><h2>Teoría</h2>` +
    datosPeriodo.th.map((parrafo) => `<p>${parrafo}</p>`).join("") +
    `<div class=tip>` +
    `<strong>Ejemplo.</strong> ${datosPeriodo.ex}</div><p class=quote>` +
    `<strong>Explicación</strong>${datosPeriodo.xp}</p></div>` +
    (`<div class=card><h2>Para profundizar</h2>` +
      (recursos.length
        ? `<div class=recs>` +
          recursos
            .map((x) => {
              const recurso = x[0];
              const marca = estado.rs[recurso[2]] || {};
              return (
                `<a class=rec href="${recurso[2]}" target=_blank rel=noopener>` +
                (`<span aria-hidden=true>${recurso[0]}</span>` +
                  (`<b>${recurso[1]}` +
                    (marca.a == 1
                      ? " <small>· ✅ sin cuenta</small>"
                      : marca.a == 2
                        ? " <small>· 🔒 pide cuenta</small>"
                        : "") +
                    `</b>`)) +
                `<em>Abrir ↗<span class=sr> (se abre en una pestaña nueva)</span>` +
                `</em></a>`
              );
            })
            .join("") +
          `</div>`
        : `<p class=mut>Aún no hay recursos para este tema. Tu docente puede sugerirte alguno.</p>`) +
      `</div>`)
  );
};
/** Clase CSS corta de cada nivel. */
const CLASE_NIVEL = { Superior: "s", Alto: "a", Básico: "b", Bajo: "j" };
/** Nota con el color de su nivel. */
const chipNota = (nota) => `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nota.toFixed(1)}</span>`;
/** Recuerda qué <details> de recursos están abiertos entre renders. */
const detallesAbiertos = {};
document.addEventListener(
  "toggle",
  (e) => {
    const k = e.target.dataset && e.target.dataset.k;
    if (k) detallesAbiertos[k] = e.target.open;
  },
  true,
);
/** Sección del panel docente para marcar, ocultar, quitar y agregar recursos. */
const vistaRecursosDocente = () =>
  `<section class=card><h2>Recursos por periodo</h2>` +
  (`<p class=mut>Marca si cada enlace abre sin cuenta, oculta los que no sirvan o agrega los tuyos. El estudiante ve la marca en el botón.</p>` +
    [10, 11]
      .map(
        (grado) =>
          `<h3 class=gh>Grado ${grado}°</h3>` +
          PERIODOS[grado]
            .map((datosPeriodo, periodo) => {
              const recursos = recursosPeriodo(grado, periodo);
              const claveDetalle = grado + "-" + periodo;
              return (
                `<details class=rd data-k="${claveDetalle}" ${detallesAbiertos[claveDetalle] ? "open" : ""}>` +
                (`<summary><span>P${periodo + 1} · ${datosPeriodo.t}</span>` +
                  `<span class=pill>${recursos.length} recursos</span>`) +
                (`</summary><div>` +
                  (recursos
                    .map((x, j) => {
                      const recurso = x[0];
                      const marca = estado.rs[recurso[2]] || {};
                      const claveRecurso = grado + "," + periodo + "," + j;
                      return (
                        `<div class=ps><b>${recurso[0]}</b>${recurso[1]}<small>` +
                        (marca.a == 1 ? "Sin cuenta" : marca.a == 2 ? "Pide cuenta" : "Sin marcar") +
                        `${marca.h ? " · oculto" : ""}</small>` +
                        `</div><div style="margin:0 0 8px"><button class=b2 data-a=ra data-i="${claveRecurso},1" aria-label="Sin cuenta: ${escaparHTML(recurso[1])}">Sin cuenta</button>` +
                        `<button class=b2 data-a=ra data-i="${claveRecurso},2" aria-label="Pide cuenta: ${escaparHTML(recurso[1])}">Pide cuenta</button>` +
                        (`<button class=b2 data-a=rh data-i="${claveRecurso}" aria-label="${marca.h ? "Mostrar" : "Ocultar"}: ${escaparHTML(recurso[1])}">${marca.h ? "Mostrar" : "Ocultar"}</button>` +
                          (x[1]
                            ? `<button class=b2 data-a=rd data-i="${claveRecurso}" aria-label="Quitar: ${escaparHTML(recurso[1])}">Quitar</button>`
                            : "") +
                          `</div>`)
                      );
                    })
                    .join("") || `<p class=mut>Sin recursos todavía.</p>`) +
                  `</div>`) +
                `</details>`
              );
            })
            .join(""),
      )
      .join("") +
    `<h3 class=gh>Agregar recurso</h3>`) +
  `<div class=row><label>Grado<select id=rg>` +
  `<option value=10>10°</option><option value=11>11°</option>` +
  `</select></label><label>Periodo<select id=rp>` +
  `<option value=0>1</option><option value=1>2</option>` +
  `<option value=2>3</option><option value=3>4</option>` +
  `</select></label></div><label>Título<input id=rt autocomplete=off>` +
  `</label><label>Enlace<input id=ru autocomplete=off placeholder="https://">` +
  `</label><button class=btn data-a=radd>Agregar</button>` +
  `</section>`;
/* ---------- 6. INFORME HTML PARA EL DOCENTE ---------- */
/** Descarga un texto como archivo (nombre, contenido y tipo MIME). */
const descargar = (nombreArchivo, contenido, tipoMime) => {
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipoMime + ";charset=utf-8" }));
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  setTimeout(() => {
    URL.revokeObjectURL(enlace.href);
    enlace.remove();
  }, 500);
};
/** Total de actividades omitidas por el perfil. */
const omitidas = (perfil) =>
  Object.values(perfil.u).reduce(
    (total, progreso) => total + (progreso.sk || []).reduce((x, y) => x + y, 0),
    0,
  );
/** Genera el informe HTML de todos los perfiles en estado.p (con su CSS y fondo animado). */
const informeGrupal = () => {
  const perfiles = Object.values(estado.p);
  const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const notas = perfiles.map(notaFinal).filter((x) => x != null);
  /** Cantidad de periodos terminados del perfil. */
  const periodosCompletos = (perfil) => Object.values(perfil.u).filter((progreso) => progreso.done).length;
  /** Etiqueta de nivel con su color (o «–»). */
  const chipNivel = (nota) =>
    nota == null ? "–" : `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nivel(nota)}</span>`;
  /** Sección del informe con la tabla de notas de un estudiante. */
  const seccionEstudiante = (perfil) => {
    const nota = notaFinal(perfil);
    return (
      `<section><div class=top><div><h2>${escaparHTML(perfil.name)}</h2>` +
      `<p class=m>Grado ${perfil.grade}° · ${periodosCompletos(perfil)} de 4 periodos · actividades omitidas: ${omitidas(perfil)}</p>` +
      (`</div><div class=big>${nota == null ? "–" : nota.toFixed(1)}` +
        (periodosCompletos(perfil) < 4 && nota != null ? " <small>parcial</small>" : "") +
        `</div>`) +
      (`</div><table><tr><th>Periodo</th>` +
        NOMBRES_ACTIVIDADES.map((nombreActividad) => `<th>${nombreActividad}</th>`).join("") +
        `<th>Nota</th>`) +
      (`<th>Nivel</th><th>Pistas usadas</th></tr>` +
        PERIODOS[perfil.grade]
          .map((datosPeriodo, i) => {
            const progreso = perfil.u[i];
            return (
              `<tr><td>P${i + 1} ${escaparHTML(datosPeriodo.t)}</td>` +
              NOMBRES_ACTIVIDADES.map((nombreActividad, k) =>
                progreso
                  ? k < 5 && progreso.sk[k]
                    ? "<td class=o>Omitida</td>"
                    : `<td>` + (progreso.sc[k] != null ? progreso.sc[k].toFixed(1) : "–") + `</td>`
                  : "<td>–</td>",
              ).join("") +
              `<td>` +
              (progreso && progreso.done
                ? notaPeriodo(progreso).toFixed(1) + (typeof progreso.ov === "number" ? " (ajustada)" : "")
                : "–") +
              `</td>` +
              (`<td>` +
                (progreso && progreso.done ? chipNivel(notaPeriodo(progreso)) : "–") +
                `</td>` +
                `<td>${progreso ? (progreso.h || []).reduce((x, y) => x + y, 0) : "–"}</td>`) +
              `</tr>`
            );
          })
          .join("") +
        `</table>`) +
      `</section>`
    );
  };
  return (
    `<!doctype html><html lang=es><head><meta charset=utf-8>` +
    `<meta name=viewport content="width=device-width,initial-scale=1">` +
    `<title>Informe de desempeño · ${BRAND}</title>` +
    `<style>
:root{--bg:#061a24;--a:#5eead4;--c:#ff9f80;--ink:#eafffb;--soft:#a9cfcb;--line:#5eead440}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
.aur{position:fixed;inset:0;z-index:-2;overflow:hidden}.aur b{position:absolute;width:55vmax;height:55vmax;border-radius:50%;filter:blur(90px);animation:dr 20s ease-in-out infinite alternate}.aur b:nth-child(1){background:#0d948880;left:-15vmax;top:-18vmax}.aur b:nth-child(2){background:#ff9f8040;right:-22vmax;bottom:-22vmax;animation-duration:26s}.aur b:nth-child(3){background:#0ea5e950;left:35%;top:35%;animation-duration:32s}
@keyframes dr{to{transform:translate(9vmax,6vmax) scale(1.18)}}@keyframes in{from{opacity:0;transform:translateY(18px)}}@keyframes sh{to{background-position:-220% 0}}
#net{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
.h{max-width:980px;margin:0 auto;padding:36px 24px 8px;animation:in .6s cubic-bezier(.2,.8,.2,1) both}.h small{color:var(--a);letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:.75rem}.h h1{margin:8px 0 6px;font-size:clamp(1.8rem,5vw,3rem);line-height:1.08}.h p{margin:0;color:var(--soft)}
em{font-style:normal;background:linear-gradient(100deg,var(--a),var(--c),var(--a));background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sh 4s linear infinite}
.w{max-width:980px;margin:0 auto;padding:16px 24px 50px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 20px}.k div{background:linear-gradient(160deg,#0d948840,#06202c99);border:1px solid var(--line);border-radius:18px;padding:14px 16px;backdrop-filter:blur(6px);animation:in .6s both;animation-delay:.1s}.k b{display:block;font-size:1.9rem;line-height:1.1;color:var(--a)}.k span{color:var(--soft);font-size:.85rem}
section{background:linear-gradient(160deg,#0d948830,#06202ccc);border:1px solid var(--line);border-radius:20px;padding:20px;margin:0 0 18px;overflow-x:auto;backdrop-filter:blur(6px);animation:in .6s both;animation-delay:.2s;transition:border-color .25s,box-shadow .25s}section:hover{border-color:var(--a);box-shadow:0 14px 34px #0d94883a}
h2{margin:0 0 4px;font-size:1.2rem}.m{color:var(--soft);font-size:.9rem;margin:0 0 12px}.w>.m{text-align:center}
table{border-collapse:collapse;width:100%;font-size:.88rem}th{color:var(--a);text-align:left;font-size:.76rem;letter-spacing:.06em;text-transform:uppercase}td,th{padding:8px 10px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}
.nv{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:700;font-size:.78rem;white-space:nowrap}.s{background:#7be0a022;color:#7be0a0}.a{background:#38bdf833;color:#7dd3fc}.b{background:#ffd16622;color:#ffd166}.j{background:#ff8f8f22;color:#ff9a9a}.o{color:#ff9a9a;font-weight:600}
.top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.big{font-size:2rem;font-weight:800;color:var(--a)}.big small{font-size:.8rem;color:var(--soft);font-weight:400}
@media(prefers-reduced-motion:reduce){*,:before,:after{animation:none!important;transition:none!important}}
@media print{*{animation:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff;color:#111}.aur,#net{display:none}.k div,section{background:#fff;border:1px solid #cfd8d6;backdrop-filter:none;break-inside:avoid;page-break-inside:avoid}.m,.k span,.h p,.big small{color:#555}th,.k b,.big,.h small{color:#0f766e}em{background:none;color:#0f766e}.s{color:#14693a}.a{color:#075985}.b{color:#8a5a00}.j,.o{color:#a31d1d}}
</style>` +
    `</head><body><div class=aur aria-hidden=true>` +
    `<b></b><b></b><b></b></div><canvas id=net aria-hidden=true>` +
    `</canvas><header class=h><small>${BRAND} · Filosofía 10° y 11°</small>` +
    `<h1>Informe de <em>desempeño</em></h1><p>Generado el ${fecha}</p>` +
    `</header><main class=w><div class=k><div>` +
    `<b>${perfiles.length}</b><span>estudiantes</span>` +
    (`</div><div><b>` +
      (notas.length ? (notas.reduce((x, y) => x + y, 0) / notas.length).toFixed(1) : "–") +
      `</b>`) +
    `<span>promedio general</span></div><div>` +
    (`<b>${perfiles.filter((perfil) => periodosCompletos(perfil) == 4).length}</b>` +
      `<span>completaron la ruta</span>`) +
    `</div><div><b>${perfiles.reduce((n, perfil) => n + omitidas(perfil), 0)}</b>` +
    `<span>actividades omitidas</span></div></div>` +
    (`<section><h2>Resumen del grupo</h2><p class=m>Escala 1.0 a 5.0. Pesos: ` +
      NOMBRES_ACTIVIDADES.map((n, i) => n + " " + PESOS[i] * 100 + "%").join(", ") +
      `. Sin pistas la actividad vale 5.0; cada pista baja su nota. Una actividad omitida cuenta 1.0.</p>`) +
    `<table><tr><th>Estudiante</th><th>Grado</th>` +
    `<th>P1</th><th>P2</th><th>P3</th><th>P4</th>` +
    (`<th>Final</th><th>Nivel</th></tr>` +
      (perfiles
        .map(
          (perfil) =>
            `<tr><td><strong>${escaparHTML(perfil.name)}</strong></td>` +
            (`<td>${perfil.grade}°</td>` +
              [0, 1, 2, 3]
                .map(
                  (i) =>
                    `<td>` +
                    (perfil.u[i] && perfil.u[i].done ? notaPeriodo(perfil.u[i]).toFixed(1) : "–") +
                    `</td>`,
                )
                .join("") +
              `<td>`) +
            `<strong>${notaFinalTexto(perfil)}</strong></td><td>${chipNivel(notaFinal(perfil))}</td>` +
            `</tr>`,
        )
        .join("") || "<tr><td colspan=8>Aún no hay estudiantes.</td></tr>") +
      `</table>`) +
    `</section>${perfiles.map(seccionEstudiante).join("")}<p class=m>Superior 4.6–5.0 · Alto 4.0–4.5 · Básico 3.0–3.9 · Bajo 1.0–2.9. Los rangos pueden variar según el sistema de evaluación del colegio.</p>` +
    `</main><script>(function(){var c=document.getElementById("net"),x=c.getContext("2d"),rm=matchMedia("(prefers-reduced-motion:reduce)"),LINK=150,A="94,234,212",C="255,159,128",w=0,h=0,P=[],mx=-999,my=-999,raf=0,t0=0;
function mk(){return{x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:1+Math.random()*1.3,g:Math.random()<.35}}
function draw(){x.clearRect(0,0,w,h);var i,j,a,b,d,p;for(i=0;i<P.length;i++){a=P[i];for(j=i+1;j<P.length;j++){b=P[j];d=Math.hypot(a.x-b.x,a.y-b.y);if(d<LINK){x.strokeStyle="rgba("+(a.g&&b.g?C:A)+","+((1-d/LINK)*.3)+")";x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke()}}}
for(i=0;i<P.length;i++){p=P[i];d=Math.hypot(p.x-mx,p.y-my);if(d<170){x.strokeStyle="rgba("+C+","+((1-d/170)*.5)+")";x.beginPath();x.moveTo(p.x,p.y);x.lineTo(mx,my);x.stroke()}}
for(i=0;i<P.length;i++){p=P[i];x.fillStyle="rgba("+(p.g?C:A)+","+(p.g?.85:.7)+")";x.beginPath();x.arc(p.x,p.y,p.r,0,6.2832);x.fill()}}
function fit(){var d=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;c.width=w*d;c.height=h*d;x.setTransform(d,0,0,d,0,0);var n=Math.min(110,Math.max(26,Math.round(w*h/14000)));while(P.length<n)P.push(mk());P.length=n;draw()}
function tick(t){var k=Math.min((t-t0)/16.7,3)||1,i,p,dx,dy,dd;t0=t;for(i=0;i<P.length;i++){p=P[i];dx=mx-p.x;dy=my-p.y;dd=Math.hypot(dx,dy);if(dd<170&&dd>1){p.x+=dx/dd*.35*k;p.y+=dy/dd*.35*k}p.x+=p.vx*k;p.y+=p.vy*k;if(p.x<-10)p.x=w+10;else if(p.x>w+10)p.x=-10;if(p.y<-10)p.y=h+10;else if(p.y>h+10)p.y=-10}draw();raf=requestAnimationFrame(tick)}
function run(){cancelAnimationFrame(raf);if(!rm.matches&&!document.hidden){t0=performance.now();raf=requestAnimationFrame(tick)}}
addEventListener("pointermove",function(e){mx=e.clientX;my=e.clientY});addEventListener("resize",fit);document.addEventListener("visibilitychange",run);fit();run()})();<\/script>` +
    `</body></html>`
  );
};

/* ---------- 6b. REPORTE HTML INDIVIDUAL POR ESTUDIANTE ---------- */
/** Reutiliza exactamente el CSS y el fondo animado del informe grupal: se generan con informeGrupal() sobre una lista vacía y se extraen. */
const recursosInforme = () => {
  const perfilesGuardados = estado.p;
  let html = "";
  estado.p = {};
  try {
    html = informeGrupal();
  } finally {
    estado.p = perfilesGuardados;
  }
  return {
    css: (html.match(/<style>([\s\S]*?)<\/style>/) || [0, ""])[1],
    js: (html.match(/<script>[\s\S]*?<\/script>/) || [""])[0],
  };
};
/** Convierte un nombre en un fragmento seguro para el nombre de archivo. */
const fileSlug = (texto) =>
  normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "estudiante";
/** CSS adicional del reporte individual (se suma al del informe grupal). */
const CSS_REPORTE_INDIVIDUAL = `
.lead{margin:8px 0 0;font-size:1rem}.lead strong{color:var(--a)}
.dtab td,.dtab th{padding:8px 7px}.dtab td:first-child{min-width:150px}.dtab th{font-size:.7rem}
.chart svg{display:block;width:100%;max-width:520px;height:auto;margin:0 auto}.chart .gl{stroke:#5eead42a}.chart .bl{stroke:#5eead480}.chart .ax{fill:var(--soft);font-size:11px}.chart .vl{fill:var(--ink);font-size:11px;font-weight:700}.chart .nd{fill:var(--soft);font-size:12px}
.ls{fill:#7be0a0;background:#7be0a0}.la{fill:#7dd3fc;background:#7dd3fc}.lb{fill:#ffd166;background:#ffd166}.lj{fill:#ff9a9a;background:#ff9a9a}.ln{fill:#a9cfcb55;background:#a9cfcb55}
.bars{display:grid;gap:10px}.br{display:grid;grid-template-columns:150px minmax(0,1fr) 44px;gap:12px;align-items:center}.br span{color:var(--soft);font-size:.88rem}.br i{display:block;height:12px;border-radius:99px;background:#5eead41f;overflow:hidden}.br i b{display:block;height:100%;border-radius:99px}.br strong{text-align:right}
section.ins{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.ins ul,ol{margin:6px 0 0;padding-left:20px}.ins li,ol li{margin:5px 0}
.per{padding:10px 0;border-bottom:1px solid var(--line)}.per:last-child{border-bottom:0}.per h3{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 4px;font-size:1rem}.per h3 b{color:var(--a)}.per p{margin:0;color:var(--soft)}
td small{color:var(--soft)}.nv.n{background:#a9cfcb22;color:var(--soft)}
@media(max-width:560px){.h,.w{padding-left:16px;padding-right:16px}.br{grid-template-columns:100px minmax(0,1fr) 40px}.big{font-size:1.6rem}}
@media print{.chart .gl{stroke:#d5dfdd}.chart .bl{stroke:#9fb3b0}.chart .ax,.chart .nd{fill:#555}.chart .vl{fill:#111}.br span,.per p,td small,.lead{color:#333}.br i{background:#e6efed}.per h3 b,.lead strong{color:#0f766e}.ls{fill:#2f9e5f;background:#2f9e5f}.la{fill:#0284c7;background:#0284c7}.lb{fill:#d4a017;background:#d4a017}.lj{fill:#c53030;background:#c53030}.nv.n{color:#555}h2{break-after:avoid}tr{break-inside:avoid}section{overflow:visible}.dtab{font-size:.74rem}.dtab td,.dtab th{padding:6px 4px}.dtab td:first-child{min-width:0}}
`;
/** Genera el reporte HTML individual de un estudiante. */
const reporteIndividual = (perfil) => {
  const { css, js } = recursosInforme();
  const formatoFecha = { day: "numeric", month: "long", year: "numeric" };
  const fecha = new Date().toLocaleDateString("es-CO", formatoFecha);
  const temas = PERIODOS[perfil.grade] || PERIODOS[10];
  const nota = notaFinal(perfil);
  const completados = periodosTerminados(perfil).length;
  const analisis = analisisEstudiante(perfil);
  const promedios = promediosActividad(perfil);
  const nombreEsc = escaparHTML(perfil.name);
  /** Etiqueta de nivel con su color. */
  const chipNivel = (nota) => `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nivel(nota)}</span>`;
  /** Descripción del desempeño según la nota y el grado. */
  const descripcionNivel = (nota) =>
    `${VERBOS_GRADO[perfil.grade] || VERBOS_GRADO[10]} los temas ${SUFIJOS_NIVEL[NIVELES.indexOf(nivel(nota))]}.`;
  const notasPeriodo = [0, 1, 2, 3].map((i) =>
    perfil.u[i] && perfil.u[i].done ? notaPeriodo(perfil.u[i]) : null,
  );
  const actualizado = perfil.updatedAt ? new Date(perfil.updatedAt) : null;
  /** Convierte un arreglo de textos en elementos <li> escapados. */
  const listaHTML = (elementos) => elementos.map((texto) => `<li>${escaparHTML(texto)}</li>`).join("");
  return (
    `<!doctype html><html lang=es><head><meta charset=utf-8>` +
    `<meta name=viewport content="width=device-width,initial-scale=1">` +
    `<title>Reporte individual · ${nombreEsc} · ${BRAND}</title>` +
    `<style>${css}${CSS_REPORTE_INDIVIDUAL}</style></head>` +
    `<body><div class=aur aria-hidden=true><b>` +
    `</b><b></b><b></b></div><canvas id=net aria-hidden=true>` +
    `</canvas><header class=h><small>${BRAND} · Filosofía ${perfil.grade}° · Reporte individual</small>` +
    `<h1>Reporte de <em>desempeño</em></h1><p>${nombreEsc} · Grado ${perfil.grade}° · Generado el ${fecha}</p>` +
    `</header><main class=w>
<section><div class=top>` +
    (`<div><h2>${nombreEsc}</h2><p class=m>Grado ${perfil.grade}° · ${completados} de 4 periodos completados` +
      (actualizado && !isNaN(actualizado)
        ? " · última actualización: " + actualizado.toLocaleDateString("es-CO", formatoFecha)
        : "") +
      `</p>`) +
    (`</div><div class=big>${formatoNota(nota)}` +
      (nota != null && completados < 4 ? " <small>parcial</small>" : "") +
      ` ${nota != null ? chipNivel(nota) : ""}</div>`) +
    (`</div><p class=lead>` +
      (nota == null
        ? "Aún no hay periodos terminados: la nota final se calculará cuando el estudiante complete al menos un periodo."
        : `<strong>Nivel ${nivel(nota)}.</strong> ${descripcionNivel(nota)}`) +
      `</p>`) +
    `</section>
<div class=k><div><b>${formatoNota(nota)}</b>` +
    (`<span>nota final` + (nota != null && completados < 4 ? " (parcial)" : "") + `</span>`) +
    `</div><div><b>${completados}/4</b><span>periodos completados</span>` +
    `</div><div><b>${totalPistas(perfil)}</b><span>pistas usadas</span>` +
    `</div><div><b>${omitidas(perfil)}</b><span>actividades omitidas</span>` +
    `</div><div><b>${totalErrores(perfil)}</b><span>errores</span>` +
    `</div></div>
<section><h2>Notas por periodo</h2>` +
    `<p class=m>Escala 1.0 a 5.0. El color de cada barra indica el nivel de desempeño.</p>` +
    (`<div class=chart>` +
      graficoBarrasSVG(
        ["P1", "P2", "P3", "P4"],
        [
          {
            v: notasPeriodo,
            tip: (i) =>
              `P${i + 1} · ${escaparHTML(temas[i].t)}: ` +
              (notasPeriodo[i] == null
                ? "sin terminar"
                : notasPeriodo[i].toFixed(1) + " · " + nivel(notasPeriodo[i])),
          },
        ],
        "rs",
        "Notas por periodo de " + nombreEsc,
        notasPeriodo.map((x, i) => `P${i + 1}: ${x == null ? "sin terminar" : x.toFixed(1)}`).join(", "),
      ) +
      `</div>`) +
    `</section>
<section><h2>Detalle por periodo y actividad</h2>` +
    (`<p class=m>Pesos: ` +
      NOMBRES_ACTIVIDADES.map((n, i) => n + " " + PESOS[i] * 100 + "%").join(", ") +
      `. Sin pistas la actividad vale 5.0; cada pista baja su nota. Una actividad omitida cuenta 1.0.</p>`) +
    (`<table class=dtab><tr><th>Periodo</th>` +
      ACTIVIDADES_CORTAS.map((n, k) => `<th title="${NOMBRES_ACTIVIDADES[k]}">${n}</th>`).join("") +
      `<th>Nota</th>`) +
    `<th>Nivel</th><th>Pistas usadas</th><th>Omit.</th>` +
    (`<th>Errores</th></tr>` +
      temas
        .map((tema, i) => {
          const progreso = perfil.u[i];
          if (!progreso)
            return (
              `<tr><td>P${i + 1} ${escaparHTML(tema.t)}</td>` +
              `<td colspan=11><small>Sin iniciar</small>` +
              `</td></tr>`
            );
          const notasActividad = progreso.sc || [];
          const omitidasActividad = progreso.sk || [];
          return (
            `<tr><td>P${i + 1} ${escaparHTML(tema.t)}</td>` +
            NOMBRES_ACTIVIDADES.map((_, k) =>
              k < 5 && omitidasActividad[k]
                ? "<td class=o>Omitida</td>"
                : `<td>` +
                  (typeof notasActividad[k] === "number" ? notasActividad[k].toFixed(1) : "–") +
                  `</td>`,
            ).join("") +
            `<td>` +
            (progreso.done
              ? notaPeriodo(progreso).toFixed(1) +
                (typeof progreso.ov === "number" ? " <small>(ajustada)</small>" : "")
              : "<small>en curso</small>") +
            `</td>` +
            (`<td>` +
              (progreso.done ? chipNivel(notaPeriodo(progreso)) : "–") +
              `</td>` +
              `<td>${suma(progreso.h || [])}</td>`) +
            `<td>${suma(omitidasActividad)}</td><td>${+progreso.e || 0}</td></tr>`
          );
        })
        .join("") +
      `</table>`) +
    (`</section>
<section><h2>Desempeño por periodo</h2>` +
      temas
        .map((tema, i) => {
          const progreso = perfil.u[i];
          const x = notasPeriodo[i];
          return (
            `<div class=per><h3>P${i + 1} · ${escaparHTML(tema.t)} ` +
            (x == null
              ? `<span class="nv n">` +
                (progreso && progreso.step > 0 ? "En curso" : "Sin iniciar") +
                `</span>`
              : chipNivel(x) + ` <b>${x.toFixed(1)}</b>`) +
            `</h3>` +
            (`<p>` +
              (x == null
                ? "Periodo sin terminar: aún no tiene nivel de desempeño."
                : descripcionNivel(x) +
                  (typeof progreso.ov === "number" ? " Nota ajustada por el docente." : "")) +
              `</p>`) +
            `</div>`
          );
        })
        .join("") +
      `</section>
<section>`) +
    `<h2>Promedio por actividad</h2><p class=m>Promedio de cada actividad en los periodos terminados.</p>` +
    (`<div class=bars>` +
      NOMBRES_ACTIVIDADES.map(
        (nombreActividad, k) =>
          `<div class=br><span>${nombreActividad}</span>` +
          `<i><b class=${claseNivel(promedios[k])} style="width:${promedios[k] == null ? 0 : ((promedios[k] / 5) * 100).toFixed(1)}%">` +
          `</b></i><strong>${formatoNota(promedios[k])}</strong></div>`,
      ).join("") +
      `</div>`) +
    `</section>
<section class=ins><div><h2>Fortalezas</h2>` +
    `<ul>${listaHTML(analisis.f)}</ul></div><div><h2>Aspectos a mejorar</h2>` +
    `<ul>${listaHTML(analisis.m)}</ul></div></section>
<section>` +
    `<h2>Recomendaciones</h2><ol>${listaHTML(analisis.r)}</ol>` +
    `</section>
<p class=m>Superior 4.6–5.0 · Alto 4.0–4.5 · Básico 3.0–3.9 · Bajo 1.0–2.9. Los rangos pueden variar según el sistema de evaluación del colegio.</p>` +
    `<p class=m>Reporte generado el ${fecha} · ${BRAND}</p>` +
    `</main>${js}</body></html>`
  );
};
/* ---------- 7. DIÁLOGOS Y PISTAS ---------- */
/**
 * Diálogo modal accesible con Aceptar/Cancelar; con tipoEntrada muestra un campo ("p" = contraseña)
 * y pasa su valor a alAceptar. Si alAceptar es null es un aviso informativo: solo botón "Entendido".
 */
const dialogo = (mensaje, alAceptar, tipoEntrada, valorInicial = "") => {
  const esAviso = alAceptar === null;
  const focoPrevio = document.activeElement;
  const contenedorApp = $("#app");
  const capa = document.createElement("div");
  capa.setAttribute("role", "dialog");
  capa.setAttribute("aria-modal", "true");
  capa.setAttribute("aria-labelledby", "adm");
  capa.style.cssText =
    "position:fixed;inset:0;z-index:20;background:#000a;display:grid;place-items:center;padding:16px";
  capa.innerHTML =
    `<div class=card style="max-width:420px;margin:0;background:var(--surface)">` +
    (`<p id=adm>${mensaje}</p>` +
      (tipoEntrada
        ? `<input class=ai aria-labelledby=adm ${tipoEntrada === "p" ? "type=password" : ""}>`
        : "") +
      `<button class=btn data-y>${esAviso ? "Entendido" : "Aceptar"}</button>`) +
    (esAviso ? "" : `<button class=b2 data-n>Cancelar</button>`) +
    `</div>`;
  document.body.appendChild(capa);
  contenedorApp.inert = true;
  /** Cierra el diálogo y devuelve el foco al elemento previo. */
  const cerrar = () => {
    capa.remove();
    contenedorApp.inert = false;
    if (focoPrevio && focoPrevio.isConnected) focoPrevio.focus();
  };
  const entrada = capa.querySelector(".ai");
  const botonAceptar = capa.querySelector("[data-y]");
  const botonCancelar = capa.querySelector("[data-n]");
  if (entrada) entrada.value = valorInicial;
  if (botonCancelar) botonCancelar.onclick = cerrar;
  botonAceptar.onclick = () => {
    const valor = entrada ? entrada.value : 1;
    cerrar();
    if (alAceptar) alAceptar(valor);
  };
  capa.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
      return;
    }
    if (e.key === "Enter" && entrada && e.target === entrada) {
      e.preventDefault();
      botonAceptar.click();
      return;
    }
    if (e.key === "Tab") {
      const enfocables = [...capa.querySelectorAll("input,button")];
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
  });
  (entrada || botonAceptar).focus();
};
/** Pista número nivelPista (0–5) para la actividad de ordenar. */
const pistasOrden = (pasos, nivelPista) =>
  [
    "Empieza con el paso que parte de: “" + pasos[0].split(" ").slice(0, 3).join(" ") + "…”.",
    "Piensa la secuencia completa: ¿qué ocurre primero y qué viene como conclusión?",
    "El primer paso es: “" + pasos[0] + "”.",
    "El último paso es: “" + pasos[pasos.length - 1] + "”.",
    "El segundo paso es: “" + pasos[1] + "”.",
    "El orden empieza así: 1) " + pasos[0] + " 2) " + pasos[1] + " 3) " + pasos[2] + ".",
  ][nivelPista];
/** Pista número nivelPista (0–5) para una afirmación de verdadero o falso. */
const pistasVF = (datosPeriodo, afirmacion, nivelPista) =>
  [
    "Cuidado con las palabras absolutas como “solo”, “todo” o “siempre”.",
    "Relee la teoría de este periodo: ¿esta frase coincide con lo que dice?",
    "Recuerda la explicación: " + datosPeriodo.xp,
    "Piensa en el ejemplo: " + datosPeriodo.ex,
    "Pregúntate si puedes sustentar la frase con razones.",
    "Pista final: la respuesta es " + (afirmacion[1] ? "verdadero" : "falso") + ".",
  ][nivelPista];
/** Pistas de escritura: [0] para el Dilema y [1] para la Creación. */
const PISTAS_ESCRITURA = [
  [
    "Empieza con: “Pienso que… porque…”.",
    "Da una razón que no dependa solo de tu gusto.",
    "Incluye un ejemplo concreto de tu vida diaria.",
    "Reconoce lo que tiene de cierto la postura contraria.",
    "Usa una idea de la teoría de este periodo.",
    "Cierra con una conclusión de una sola frase.",
  ],
  [
    "Parte de algo cotidiano que normalmente das por obvio.",
    "Escribe en primera persona: qué piensas y por qué.",
    "Incluye un ejemplo concreto.",
    "Formula al menos una pregunta que no tenga respuesta fácil.",
    "Conecta tu texto con una idea de la teoría.",
    "Termina diciendo qué cambió en tu forma de pensar.",
  ],
];

/* ---------- 3b. RETOS DEL PERIODO (RETOS) ---------- */
/** Instrucción de cada tipo de reto (cl clasificar, ma relacionar, ch elegir). */
const INSTRUCCIONES_RETO = {
  cl: "Clasifica cada afirmación.",
  ma: "Relaciona cada elemento con su idea.",
  ch: "Elige la opción que corresponde a cada caso.",
};
/** Reto de cada periodo: n nombre, ty tipo, o opciones, it casos [texto, respuesta, explicación]. */
const RETOS = {
  10: [
    {
      n: "Clasifica: ¿opinión o conocimiento?",
      ty: "cl",
      o: ["Opinión (doxa)", "Conocimiento (episteme)"],
      it: [
        ["“Ese equipo es el mejor porque me cae bien.”", 0, "Se apoya en el gusto personal, no en razones."],
        [
          "“La Tierra gira alrededor del Sol: hay mediciones y observaciones que lo sustentan.”",
          1,
          "Está fundamentada en pruebas.",
        ],
        [
          "“Todos dicen que ese remedio funciona, así que debe ser cierto.”",
          0,
          "Que muchos lo digan no es una razón.",
        ],
        [
          "“Después de comparar fuentes y datos, concluyo que el estudio es confiable.”",
          1,
          "Se sostiene en razones y evidencia.",
        ],
      ],
    },
    {
      n: "Relaciona al pensador con su idea",
      ty: "ma",
      o: [
        "Duda de todo hasta hallar una certeza indudable",
        "El conocimiento nace de la experiencia",
        "La experiencia y la razón se necesitan",
      ],
      it: [
        ["Descartes", 0, "Su duda metódica llega a “pienso, luego existo”."],
        ["Hume", 1, "Es un empirista: parte de lo que percibimos."],
        ["Kant", 2, "Sintetiza razón y experiencia."],
        ["Locke", 1, "También es empirista."],
      ],
    },
    {
      n: "Identifica la idea en el caso",
      ty: "ch",
      o: ["Ídolo o prejuicio (Bacon)", "Falsación (Popper)", "Cambio de paradigma (Kuhn)"],
      it: [
        [
          "Alguien cree una noticia solo porque coincide con lo que ya pensaba.",
          0,
          "Es un prejuicio que distorsiona el conocimiento.",
        ],
        [
          "Una hipótesis se somete a una prueba que podría demostrar que está equivocada.",
          1,
          "Es el criterio de falsación.",
        ],
        [
          "La comunidad científica abandona un modelo por otro que explica mejor los datos.",
          2,
          "Es una revolución entre paradigmas.",
        ],
        ["Se acepta algo solo porque “siempre se ha dicho así”.", 0, "Es un prejuicio por costumbre."],
      ],
    },
    {
      n: "Detective de falacias",
      ty: "ch",
      o: ["Ad hominem", "Apelar a la mayoría", "Falsa dicotomía"],
      it: [
        ["“No le creas a Laura, es muy joven.”", 0, "Ataca a la persona, no al argumento."],
        ["“Todos usan esa app, así que es la mejor.”", 1, "Que muchos la usen no prueba que sea la mejor."],
        ["“O estudias medicina o eres un fracasado.”", 2, "Presenta solo dos opciones cuando hay más."],
        ["“Su propuesta es mala porque cambió de colegio.”", 0, "Descalifica a quien habla, no lo que dice."],
      ],
    },
  ],
  11: [
    {
      n: "Relaciona la postura estética",
      ty: "ma",
      o: [
        "El arte imita la realidad y puede alejarnos de la verdad",
        "El arte puede purificar las emociones",
        "El juicio de gusto es subjetivo pero pretende acuerdo universal",
      ],
      it: [
        ["Platón", 0, "Desconfiaba del arte por ser imitación."],
        ["Aristóteles", 1, "Es la idea de catarsis."],
        ["Kant", 2, "Decimos “es bello” esperando que otros coincidan."],
        ["Decir “es bello” esperando que otros coincidan", 2, "Es el juicio de gusto kantiano."],
      ],
    },
    {
      n: "¿Qué enfoque ético usa cada decisión?",
      ty: "ch",
      o: ["Virtud (Aristóteles)", "Deber (Kant)", "Consecuencias (utilitarismo)"],
      it: [
        [
          "No miento aunque me convenga, porque mentir no podría ser regla para todos.",
          1,
          "Apela a una ley universal.",
        ],
        [
          "Ayudo porque así produzco el mayor bienestar posible para el grupo.",
          2,
          "Evalúa por las consecuencias.",
        ],
        ["Actúo con honestidad porque quiero ser una persona íntegra.", 0, "Se centra en el carácter."],
        [
          "Devuelvo la billetera porque el daño de quedármela sería mayor que mi beneficio.",
          2,
          "Compara consecuencias.",
        ],
      ],
    },
    {
      n: "Clasifica las normas: ¿justas o injustas?",
      ty: "cl",
      o: ["Justa", "Injusta"],
      it: [
        [
          "Una regla que se aplica igual a todos y puede discutirse en una asamblea.",
          0,
          "Es imparcial y participativa.",
        ],
        [
          "Una norma que beneficia solo al grupo que la creó.",
          1,
          "Rawls diría que nadie la elegiría sin saber su lugar.",
        ],
        [
          "Garantizar el acceso a la educación a toda persona sin discriminación.",
          0,
          "Respeta la dignidad y los derechos.",
        ],
        [
          "Prohibir que un grupo participe en las decisiones que lo afectan.",
          1,
          "Niega la participación democrática.",
        ],
      ],
    },
    {
      n: "¿Desde qué idea se toma la decisión?",
      ty: "ch",
      o: [
        "Libertad y responsabilidad (Sartre)",
        "Pensar desde la propia realidad (pensamiento latinoamericano)",
        "Decidir por presión o moda",
      ],
      it: [
        [
          "Elijo mi carrera porque mis valores y talentos me indican este camino y asumo sus consecuencias.",
          0,
          "Asume la libertad y la responsabilidad.",
        ],
        [
          "Diseño un proyecto que responde a un problema real de mi región.",
          1,
          "Piensa desde la propia realidad.",
        ],
        [
          "Elijo estudiar lo que hacen todos mis amigos sin preguntarme qué quiero.",
          2,
          "Decide por presión o moda.",
        ],
        [
          "Reconozco que nadie decide por mí y que soy responsable de lo que elija.",
          0,
          "Es la idea central de Sartre.",
        ],
      ],
    },
  ],
};
/** Pista número nivelPista (0–5) para un caso del reto. */
const pistasReto = (datosPeriodo, caso, opciones, nivelPista) =>
  [
    "Relee con calma y descarta la opción que menos encaja.",
    "Vuelve a la teoría de este periodo: ¿qué idea se parece a este caso?",
    "Recuerda el ejemplo: " + datosPeriodo.ex,
    "Recuerda la explicación: " + datosPeriodo.xp,
    "Fíjate en las palabras clave: ¿a qué idea apuntan?",
    "Pista final: la respuesta es “" + opciones[caso[1]] + "”.",
  ][nivelPista];
/* ---------- 8. ACTIVIDADES DE COMPROBACIÓN (V/F Y RETOS) ---------- */
/** Preguntas del paso 2 (V/F) o 3 (reto) con opciones, respuesta, explicación y pista. */
const preguntasDelPaso = (paso) => {
  const datosPeriodo = periodosDelGrado()[periodoActual];
  if (paso == 2)
    return datosPeriodo.v.map((item) => ({
      p: item[0],
      o: ["Verdadero", "Falso"],
      c: item[1] ? 0 : 1,
      e: item[2],
      hint: (nivelPista) => pistasVF(datosPeriodo, item, nivelPista),
    }));
  const reto = RETOS[usuario.grade][periodoActual];
  return reto.it.map((item) => ({
    p: item[0],
    o: reto.o,
    c: item[1],
    e: item[2],
    hint: (nivelPista) => pistasReto(datosPeriodo, item, reto.o, nivelPista),
  }));
};
/** Procesa la respuesta a una pregunta: acierto, pista tras el primer error o cierre tras el segundo. */
const responderPregunta = (seleccion, clave, preguntas, paso) => {
  const [iPregunta, iOpcion] = seleccion.split(",");
  const progreso = progresoPeriodo(periodoActual);
  const respuestas = progreso.a[clave] || (progreso.a[clave] = []);
  const intentos = progreso.a[clave + "t"] || (progreso.a[clave + "t"] = []);
  const mensajes = progreso.a[clave + "m"] || (progreso.a[clave + "m"] = []);
  if (respuestas[+iPregunta] != null) return;
  const pregunta = preguntas[+iPregunta];
  if (+iOpcion === pregunta.c) {
    respuestas[+iPregunta] = 1;
    mensajes[+iPregunta] = "";
  } else {
    intentos[+iPregunta] = (intentos[+iPregunta] || 0) + 1;
    progreso.e++;
    if (intentos[+iPregunta] >= 2) {
      respuestas[+iPregunta] = 2;
      mensajes[+iPregunta] = "";
    } else {
      progreso.h[paso - 1]++;
      const nivelPista = (progreso.h[paso - 1] - 1) % 6;
      mensajes[+iPregunta] = "💡 Pista " + (nivelPista + 1) + " de 6: " + pregunta.hint(nivelPista);
    }
  }
  save();
  focoPendiente = "#fb" + iPregunta;
  announce(
    respuestas[+iPregunta] == 1
      ? "Correcto. " + pregunta.e
      : respuestas[+iPregunta] == 2
        ? "Revisa. " + pregunta.e
        : mensajes[+iPregunta],
  );
  render();
};
/** Tarjeta con las preguntas del paso (V/F o reto) y el botón Continuar. */
const vistaPreguntas = (paso, titulo, intro, clave, progreso) => {
  const preguntas = preguntasDelPaso(paso);
  const respuestas = progreso.a[clave] || [];
  const mensajes = progreso.a[clave + "m"] || [];
  return (
    `<div class=card><h2>${titulo}</h2><p class=mut>${intro}</p>` +
    preguntas
      .map(
        (pregunta, indice) =>
          `<div class=nd style="margin:12px 0" role=group aria-labelledby=q${indice}>` +
          (`<p id=q${indice}>${pregunta.p}</p>` +
            (respuestas[indice] == null
              ? (mensajes[indice]
                  ? `<div class=fb id=fb${indice} tabindex=-1 role=group aria-labelledby=ft${indice}>` +
                    `<h3 id=ft${indice}>Pista</h3><p>${mensajes[indice]}</p></div>`
                  : "") +
                `<div class=opts>` +
                pregunta.o
                  .map(
                    (opcion, iOpcion) =>
                      `<button class=opt data-a=ck data-i=${indice},${iOpcion}>${opcion}</button>`,
                  )
                  .join("") +
                `</div>`
              : `<div class="fb ${respuestas[indice] === 1 ? "ok" : ""}" id=fb${indice} tabindex=-1 role=group aria-labelledby=ft${indice}>` +
                (`<h3 id=ft${indice}>` + (respuestas[indice] === 1 ? "Correcto" : "Revisa") + `</h3>`) +
                `<p>${pregunta.e}</p></div>`) +
            `</div>`),
      )
      .join("") +
    `<button id=nxb class=btn data-a=nx ${actividadCompleta() ? "" : atributosBloqueo()}>Continuar</button>` +
    `</div>`
  );
};
/* ---------- 9. PANEL DOCENTE: DATOS DE LA NUBE ---------- */
/** Mapa id → perfil construido con la lista del docente. */
const teacherMap = () =>
  Object.fromEntries(
    teacherRoster.map((registro) => [
      registro.id,
      {
        ...(registro.progress || {}),
        id: registro.id,
        name: registro.name,
        grade: String(registro.grade),
        u: (registro.progress && registro.progress.u) || {},
        updatedAt: registro.updatedAt,
      },
    ]),
  );
/** Comprueba la sesión docente y carga la lista y los recursos. */
const loadTeacherData = async () => {
  teacherReady = false;
  teacherLoadError = "";
  try {
    const session = await api("/api/sofia/auth/session", { method: "GET" });
    if (!session.authenticated) {
      vistaActual = "login";
      render();
      return false;
    }
    const [roster, settings] = await Promise.all([
      api("/api/sofia/teacher/students", { method: "GET" }),
      api("/api/sofia/teacher/settings", { method: "GET" }),
    ]);
    teacherRoster = Array.isArray(roster) ? roster : [];
    teacherSettings = settings.settings || { resources: {}, extraResources: {} };
    estado.rs = teacherSettings.resources || {};
    estado.ex = teacherSettings.extraResources || {};
    persist();
    teacherReady = true;
    vistaActual = "doc";
    render();
    return true;
  } catch (e) {
    teacherLoadError = e.message;
    teacherReady = false;
    vistaActual = "login";
    render();
    return false;
  }
};
/** Guarda en la nube los recursos del docente. */
const updateTeacherSettings = async () => {
  try {
    setSync("syncing", "Guardando recursos…");
    const result = await api("/api/sofia/teacher/settings", {
      method: "PUT",
      body: JSON.stringify({ resources: estado.rs, extraResources: estado.ex }),
    });
    teacherSettings = result.settings || { resources: estado.rs, extraResources: estado.ex };
    setSync("synced", "Recursos sincronizados");
  } catch (e) {
    setSync(navigator.onLine ? "error" : "offline", e.message);
  }
};
/** Guarda en la nube los cambios del docente sobre un estudiante. */
const updateTeacherStudent = async (id, perfil) => {
  try {
    setSync("syncing", "Guardando cambios…");
    const updated = await api(`/api/sofia/teacher/students/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ progress: progressOf(perfil) }),
    });
    teacherRoster = teacherRoster.map((registro) => (registro.id === id ? updated : registro));
    setSync("synced", "Cambios sincronizados");
    return true;
  } catch (e) {
    setSync(navigator.onLine ? "error" : "offline", e.message);
    dialogo("No se pudo guardar en la nube: " + escaparHTML(e.message), null);
    return false;
  }
};
/* ---------- 9b. PANEL DOCENTE: ESTADÍSTICAS, GRÁFICOS Y DETALLE ---------- */
/** Estado del tablero: filtro por grado (g) y búsqueda por nombre (q). */
let filtroDocente = { g: "", q: "" };
/** Orden de la tabla: criterio (k) y dirección (d: 1 ascendente, −1 descendente). */
let ordenDocente = { k: "name", d: 1 };
/** Clave del estudiante cuyo detalle está abierto (o null). */
let estudianteSeleccionado = null;
/** Temporizador de la búsqueda del tablero. */
let temporizadorBusqueda = 0;
/** Nombres cortos de las seis notas para tablas y gráficos. */
const ACTIVIDADES_CORTAS = ["Ordenar", "V/F", "Reto", "Dilema", "Creación", "Pistas"];
/** Nombres cortos de los siete pasos de un periodo. */
const PASOS_CORTOS = ["Teoría", "Ordenar", "V/F", "Reto", "Dilema", "Creación", "Resumen"];
/** Texto en minúsculas y sin tildes, para comparar y buscar. */
const normalizar = (texto) =>
  String(texto || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
/** Suma los valores numéricos de un arreglo. */
const suma = (valores) => valores.reduce((acumulado, valor) => acumulado + (+valor || 0), 0);
/** Promedio de un arreglo (null si está vacío). */
const promedio = (valores) => (valores.length ? suma(valores) / valores.length : null);
/** Nota con un decimal, o «–» si es null. */
const formatoNota = (nota) => (nota == null ? "–" : nota.toFixed(1));
/** Porcentaje entero de parte sobre total (0 si total es 0). */
const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
/** Progresos de los periodos terminados del perfil. */
const periodosTerminados = (perfil) =>
  Object.values(perfil.u || {}).filter((progreso) => progreso && progreso.done);
/** Progresos de los periodos iniciados o terminados del perfil. */
const periodosIniciados = (perfil) =>
  Object.values(perfil.u || {}).filter((progreso) => progreso && (progreso.done || progreso.step > 0));
/** Total de pistas usadas por el perfil. */
const totalPistas = (perfil) => suma(Object.values(perfil.u || {}).map((progreso) => suma(progreso.h || [])));
/** Total de errores del perfil. */
const totalErrores = (perfil) => suma(Object.values(perfil.u || {}).map((progreso) => progreso.e));
/** Avance de la ruta de 0 a 1 (los periodos en curso cuentan por sus pasos). */
const avanceRuta = (perfil) =>
  suma(
    Object.values(perfil.u || {}).map((progreso) =>
      progreso.done ? 1 : Math.min(6, +progreso.step || 0) / 7,
    ),
  ) / 4;
/** Promedio de cada una de las 6 notas (Ordenar … Pistas) en los periodos terminados. */
const promediosActividad = (perfil) => {
  const terminados = periodosTerminados(perfil);
  return ACTIVIDADES_CORTAS.map((_, k) =>
    promedio(terminados.map((progreso) => (progreso.sc || [])[k]).filter((x) => typeof x === "number")),
  );
};
/** Clase CSS de color para una nota (ln si no hay nota). */
const claseNivel = (nota) => (nota == null ? "ln" : "l" + CLASE_NIVEL[nivel(nota)]);
/** Cuántos perfiles hay en cada nivel (y sin nota). */
const distribucionNiveles = (perfiles) => {
  const conteo = { Superior: 0, Alto: 0, Básico: 0, Bajo: 0, sin: 0 };
  perfiles.forEach((perfil) => {
    const nota = notaFinal(perfil);
    conteo[nota == null ? "sin" : nivel(nota)]++;
  });
  return conteo;
};
/** Alertas del estudiante: [clase de nivel (j = grave, b = atención), texto]. */
const alertasEstudiante = (perfil) => {
  const nota = notaFinal(perfil);
  const terminados = periodosTerminados(perfil).length;
  const iniciados = periodosIniciados(perfil).length;
  const pistas = totalPistas(perfil);
  const omitidasTotal = omitidas(perfil);
  const alertas = [];
  if (!iniciados) alertas.push(["j", "Sin avance"]);
  else if (!terminados) alertas.push(["b", "Sin periodos completados"]);
  if (nota != null && nota < 3) alertas.push(["j", "Nivel Bajo · " + nota.toFixed(1)]);
  else if (nota != null && nota < 4) alertas.push(["b", "Nivel Básico · " + nota.toFixed(1)]);
  if (iniciados && pistas / iniciados >= 6)
    alertas.push(["b", pistas + " pistas (" + (pistas / iniciados).toFixed(1) + " por periodo)"]);
  if (omitidasTotal >= 2)
    alertas.push([omitidasTotal >= 4 ? "j" : "b", omitidasTotal + " actividades omitidas"]);
  return alertas;
};
/** Recomendación para cada actividad con promedio bajo (mismo orden que las actividades). */
const RECOMENDACIONES_ACTIVIDAD = [
  "Practicar la reconstrucción de razonamientos (Ordenar): identificar premisas, pasos intermedios y conclusión.",
  "Justificar cada respuesta de Verdadero o falso con una idea de la teoría del periodo.",
  "Repasar los conceptos clave del reto de cada periodo y relacionarlos con ejemplos cotidianos.",
  "Fortalecer la argumentación en los dilemas: postura clara, razones y respuesta a la objeción.",
  "Desarrollar los textos de Creación con ejemplos propios y conexión explícita con la teoría.",
];
/** Fortalezas (f), aspectos a mejorar (m) y recomendaciones (r) calculados de los datos del estudiante. */
const analisisEstudiante = (perfil) => {
  const temas = PERIODOS[perfil.grade] || PERIODOS[10];
  const indicesTerminados = [0, 1, 2, 3].filter((i) => perfil.u[i] && perfil.u[i].done);
  const cantidadTerminados = indicesTerminados.length;
  const promedios = promediosActividad(perfil);
  const fortalezas = [];
  const aMejorar = [];
  const recomendaciones = [];
  const nota = notaFinal(perfil);
  if (!cantidadTerminados) {
    aMejorar.push(
      periodosIniciados(perfil).length
        ? "Aún no termina ningún periodo: tiene actividades en curso."
        : "Aún no inicia la ruta de aprendizaje.",
    );
    recomendaciones.push(
      "Acompañar el inicio de la ruta: leer la teoría del Periodo 1 y resolver sus cinco actividades.",
    );
    return {
      f: ["Aún no hay periodos terminados para identificar fortalezas."],
      m: aMejorar,
      r: recomendaciones,
    };
  }
  if (cantidadTerminados == 4) fortalezas.push("Completó la ruta de los 4 periodos.");
  else {
    aMejorar.push(
      4 - cantidadTerminados == 1
        ? "Le falta 1 periodo por completar."
        : "Le faltan " + (4 - cantidadTerminados) + " periodos por completar.",
    );
    recomendaciones.push("Completar los periodos pendientes de la ruta para consolidar la nota final.");
  }
  if (nota != null && nota >= 4) fortalezas.push(`Nota final en nivel ${nivel(nota)} (${nota.toFixed(1)}).`);
  const altas = [];
  const bajas = [];
  promedios.slice(0, 5).forEach((a, k) => {
    if (a == null) return;
    if (a >= 4.5) altas.push(`${NOMBRES_ACTIVIDADES[k]} (${a.toFixed(1)})`);
    else if (a < 3.5) {
      bajas.push(`${NOMBRES_ACTIVIDADES[k]} (${a.toFixed(1)})`);
      recomendaciones.push(RECOMENDACIONES_ACTIVIDAD[k]);
    }
  });
  if (altas.length) fortalezas.push(`Se destaca en ${altas.join(", ")}.`);
  if (bajas.length) aMejorar.push(`Promedio bajo en ${bajas.join(", ")}.`);
  const omitidasPorActividad = [0, 1, 2, 3, 4].map((k) =>
    suma(Object.values(perfil.u).map((progreso) => (progreso.sk || [])[k])),
  );
  const textoOmitidas = omitidasPorActividad
    .map((x, k) => (x ? `${NOMBRES_ACTIVIDADES[k]} (${x})` : ""))
    .filter(Boolean);
  if (textoOmitidas.length) {
    aMejorar.push(`Actividades omitidas: ${textoOmitidas.join(", ")}.`);
    recomendaciones.push("Retomar las actividades omitidas: cada una cuenta 1.0 en la nota del periodo.");
  }
  const pistasPorPeriodo = suma(indicesTerminados.map((i) => suma(perfil.u[i].h || []))) / cantidadTerminados;
  const erroresPorPeriodo = suma(indicesTerminados.map((i) => perfil.u[i].e)) / cantidadTerminados;
  if (pistasPorPeriodo <= 1)
    fortalezas.push(`Trabaja con autonomía: ${pistasPorPeriodo.toFixed(1)} pistas por periodo en promedio.`);
  else if (pistasPorPeriodo >= 6) {
    aMejorar.push(`Depende de las pistas: ${pistasPorPeriodo.toFixed(1)} por periodo en promedio.`);
    recomendaciones.push(
      "Releer la teoría y el ejemplo de cada periodo antes de responder, para depender menos de las pistas.",
    );
  }
  if (erroresPorPeriodo <= 1)
    fortalezas.push(`Comete pocos errores (${erroresPorPeriodo.toFixed(1)} por periodo).`);
  else if (erroresPorPeriodo >= 4) {
    aMejorar.push(`Comete muchos errores: ${erroresPorPeriodo.toFixed(1)} por periodo en promedio.`);
    recomendaciones.push("Leer con calma cada afirmación y justificar la respuesta antes de elegirla.");
  }
  if (cantidadTerminados >= 2) {
    const a = indicesTerminados[0];
    const b = indicesTerminados[cantidadTerminados - 1];
    const notaInicial = notaPeriodo(perfil.u[a]);
    const notaUltima = notaPeriodo(perfil.u[b]);
    const mejor = indicesTerminados.reduce(
      (x, i) => (notaPeriodo(perfil.u[i]) > notaPeriodo(perfil.u[x]) ? i : x),
      indicesTerminados[0],
    );
    if (notaUltima - notaInicial >= 0.5)
      fortalezas.push(
        `Mejoró de P${a + 1} (${notaInicial.toFixed(1)}) a P${b + 1} (${notaUltima.toFixed(1)}).`,
      );
    else if (notaInicial - notaUltima >= 0.5) {
      aMejorar.push(
        `Su nota bajó de P${a + 1} (${notaInicial.toFixed(1)}) a P${b + 1} (${notaUltima.toFixed(1)}).`,
      );
      recomendaciones.push(
        `Revisar con el estudiante los temas de “${temas[b].t}” y reforzarlos con los recursos del periodo.`,
      );
    }
    if (notaPeriodo(perfil.u[mejor]) >= 4)
      fortalezas.push(
        `Su mejor periodo fue P${mejor + 1} · ${temas[mejor].t} (${notaPeriodo(perfil.u[mejor]).toFixed(1)}).`,
      );
  }
  if (nota != null && nota < 3)
    recomendaciones.push(
      "Plan de refuerzo con acompañamiento docente: repasar la teoría, rehacer actividades con apoyo y hacer seguimiento semanal.",
    );
  if (!fortalezas.length)
    fortalezas.push("Aún no se identifican fortalezas destacadas; se harán visibles al avanzar en la ruta.");
  if (!aMejorar.length) aMejorar.push("No se identifican aspectos críticos con los datos actuales.");
  if (!recomendaciones.length)
    recomendaciones.push(
      "Mantener el ritmo de trabajo y proponer retos de profundización con los recursos de cada periodo.",
    );
  return { f: fortalezas, m: aMejorar, r: recomendaciones };
};
/** Gráfico SVG de barras (escala 0–5). series: [{c?: clase, v: [valores|null], tip: i => texto ya escapado}]; sin c, cada barra toma el color de su nivel. */
const graficoBarrasSVG = (grupos, series, id, titulo, descripcion) => {
  const ANCHO = 360;
  const ALTO = 200;
  const MARGEN_IZQ = 28;
  const MARGEN_DER = 6;
  const MARGEN_SUP = 18;
  const MARGEN_INF = 26;
  const altoGrafico = ALTO - MARGEN_SUP - MARGEN_INF;
  const anchoGrupo = (ANCHO - MARGEN_IZQ - MARGEN_DER) / grupos.length;
  const numSeries = series.length;
  const separacion = 4;
  const anchoBarra = Math.min(34, (anchoGrupo - 16 - separacion * (numSeries - 1)) / numSeries);
  /** Coordenada Y de un valor de la escala 0–5. */
  const posY = (valor) => MARGEN_SUP + altoGrafico * (1 - valor / 5);
  /** Número con un decimal para los atributos SVG. */
  const fmt = (numero) => numero.toFixed(1);
  let svg =
    `<svg class=chart-svg viewBox="0 0 ${ANCHO} ${ALTO}" role=img aria-labelledby="${id}-t ${id}-d">` +
    `<title id=${id}-t>${titulo}</title><desc id=${id}-d>${descripcion}</desc>`;
  for (let valor = 1; valor <= 5; valor++)
    svg +=
      `<line class=gl x1=${MARGEN_IZQ} x2=${ANCHO - MARGEN_DER} y1=${fmt(posY(valor))} y2=${fmt(posY(valor))}>` +
      `</line><text class=ax x=${MARGEN_IZQ - 6} y=${fmt(posY(valor) + 4)} text-anchor=end>${valor}</text>`;
  svg +=
    `<line class=bl x1=${MARGEN_IZQ} x2=${ANCHO - MARGEN_DER} y1=${fmt(posY(0))} y2=${fmt(posY(0))}>` +
    `</line>`;
  grupos.forEach((nombreGrupo, indiceGrupo) => {
    const inicioX =
      MARGEN_IZQ +
      indiceGrupo * anchoGrupo +
      (anchoGrupo - anchoBarra * numSeries - separacion * (numSeries - 1)) / 2;
    series.forEach((serie, indiceSerie) => {
      const valor = serie.v[indiceGrupo];
      const x = inicioX + indiceSerie * (anchoBarra + separacion);
      const tooltip = serie.tip(indiceGrupo);
      if (valor == null) {
        svg +=
          `<text class=nd x=${fmt(x + anchoBarra / 2)} y=${fmt(posY(0) - 5)} text-anchor=middle>` +
          `<title>${tooltip}</title>–</text>`;
        return;
      }
      svg +=
        `<rect class=${serie.c || claseNivel(valor)} x=${fmt(x)} y=${fmt(posY(valor))} width=${fmt(anchoBarra)} height=${fmt(posY(0) - posY(valor))} rx=4>` +
        `<title>${tooltip}</title></rect><text class=vl x=${fmt(x + anchoBarra / 2)} y=${fmt(posY(valor) - 5)} text-anchor=middle>${valor.toFixed(1)}</text>`;
    });
    svg += `<text class=ax x=${fmt(MARGEN_IZQ + indiceGrupo * anchoGrupo + anchoGrupo / 2)} y=${ALTO - 7} text-anchor=middle>${nombreGrupo}</text>`;
  });
  return svg + "</svg>";
};
/** Barras horizontales HTML/CSS: filas [{l: etiqueta HTML, v: nota|null, t: tooltip escapado, x?: nota extra}]. */
const barrasHorizontales = (filas, clase = "") =>
  `<ul class="hb ${clase}">` +
  (filas
    .map(
      (fila) =>
        `<li title="${fila.t}"><span class=hb__l>${fila.l}</span>` +
        `<span class=hb__t aria-hidden=true><i class="hb__f ${claseNivel(fila.v)}" style="width:${fila.v == null ? 0 : Math.max(2, (fila.v / 5) * 100).toFixed(1)}%">` +
        `</i></span><span class=hb__v>${formatoNota(fila.v)}${fila.x ? `<small>${fila.x}</small>` : ""}</span>` +
        `</li>`,
    )
    .join("") || `<li class=mut>Sin datos con los filtros actuales.</li>`) +
  `</ul>`;
/** Barras verticales de distribución por nivel. */
const barrasVerticales = (conteo) => {
  const niveles = [
    ["Superior", "ls", conteo.Superior],
    ["Alto", "la", conteo.Alto],
    ["Básico", "lb", conteo["Básico"]],
    ["Bajo", "lj", conteo.Bajo],
    ["Sin nota", "ln", conteo.sin],
  ];
  const total = suma(niveles.map((x) => x[2]));
  const maximo = Math.max(1, ...niveles.map((x) => x[2]));
  return (
    `<div class=vb role=img aria-label="Distribución por nivel: ` +
    niveles.map((x) => x[0] + " " + x[2]).join(", ") +
    `">` +
    niveles
      .map(
        ([etiqueta, clase, cantidad]) =>
          `<div class=vb__c title="${etiqueta}: ${cantidad} ${cantidad == 1 ? "estudiante" : "estudiantes"} (${porcentaje(cantidad, total)}%)">` +
          `<span class=vb__n>${cantidad}<small>${porcentaje(cantidad, total)}%</small>` +
          `</span><span class=vb__bar><i class=${clase} style="height:${cantidad ? Math.max(4, (cantidad / maximo) * 100) : 0}%">` +
          `</i></span><span class=vb__l>${etiqueta}</span>` +
          `</div>`,
      )
      .join("") +
    `</div>`
  );
};
/** Panel de detalle del estudiante seleccionado (estudianteSeleccionado). */
const detalleEstudiante = (clave, perfil) => {
  const nota = notaFinal(perfil);
  const completados = periodosTerminados(perfil).length;
  const analisis = analisisEstudiante(perfil);
  const promedios = promediosActividad(perfil);
  const temas = PERIODOS[perfil.grade] || PERIODOS[10];
  const actualizado = perfil.updatedAt ? new Date(perfil.updatedAt) : null;
  const nombreEsc = escaparHTML(perfil.name);
  const claveEsc = escaparHTML(clave);
  const notasPeriodo = [0, 1, 2, 3].map((i) =>
    perfil.u[i] && perfil.u[i].done ? notaPeriodo(perfil.u[i]) : null,
  );
  return (
    `<section class="card det" id=stu-detail aria-labelledby=det-h>` +
    `<div class=det__top><div><p class=ey>Detalle del estudiante</p>` +
    (`<h2 id=det-h>${nombreEsc}</h2><p class=mut>` +
      `<span class=pill>${perfil.grade}°</span> ${completados} de 4 periodos completados` +
      (actualizado && !isNaN(actualizado)
        ? " · actualizado el " +
          actualizado.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
        : "") +
      `</p>`) +
    (`</div><div class=det__grade><strong>${formatoNota(nota)}</strong>` +
      (nota == null
        ? "<small>Sin nota final</small>"
        : `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nivel(nota)}</span>` +
          (completados < 4 ? "<small>nota parcial</small>" : "<small>nota final</small>")) +
      `</div>`) +
    (`</div>` +
      barraProgreso(completados * 25, "Avance de " + nombreEsc) +
      `
<div class="tl tl--sm">`) +
    `<div><strong>${completados}<small>/4</small></strong>` +
    `<span>periodos completados</span></div><div>` +
    `<strong>${totalPistas(perfil)}</strong><span>pistas usadas</span>` +
    `</div><div><strong>${omitidas(perfil)}</strong><span>actividades omitidas</span>` +
    `</div><div><strong>${totalErrores(perfil)}</strong><span>errores</span>` +
    `</div></div>
<div class=dg><figure class=chartbox>` +
    (`<figcaption>Notas por periodo</figcaption>` +
      graficoBarrasSVG(
        ["P1", "P2", "P3", "P4"],
        [
          {
            v: notasPeriodo,
            tip: (i) =>
              `P${i + 1} · ${escaparHTML(temas[i].t)}: ` +
              (notasPeriodo[i] == null
                ? "sin terminar"
                : notasPeriodo[i].toFixed(1) + " · " + nivel(notasPeriodo[i])),
          },
        ],
        "sd",
        "Notas por periodo de " + nombreEsc,
        notasPeriodo.map((x, i) => `P${i + 1}: ${x == null ? "sin terminar" : x.toFixed(1)}`).join(", "),
      ) +
      `</figure>`) +
    `<figure class=chartbox><figcaption>Promedio por actividad <small class=mut>(periodos terminados)</small>` +
    (`</figcaption>` +
      barrasHorizontales(
        ACTIVIDADES_CORTAS.map((a, i) => ({
          l: a,
          v: promedios[i],
          t: `${NOMBRES_ACTIVIDADES[i]}: ${formatoNota(promedios[i])}`,
        })),
      ) +
      `</figure>`) +
    `</div>
<div class=dg><div class="ins ins--f">` +
    (`<h3>Fortalezas</h3><ul>` + analisis.f.map((x) => `<li>${escaparHTML(x)}</li>`).join("") + `</ul>`) +
    `</div><div class="ins ins--m"><h3>Aspectos a mejorar</h3>` +
    (`<ul>` + analisis.m.map((x) => `<li>${escaparHTML(x)}</li>`).join("") + `</ul>`) +
    `</div></div>
<h3 class=gh>Detalle por periodo</h3>` +
    `<div class=tw><table class="dt dt--det">` +
    `<caption class=sr>Notas por periodo y actividad de ${nombreEsc}</caption>` +
    (`<tr><th scope=col>Periodo</th>` +
      ACTIVIDADES_CORTAS.map((a) => `<th scope=col>${a}</th>`).join("") +
      `<th scope=col>Nota</th>`) +
    `<th scope=col>Nivel</th><th scope=col>Pistas usadas</th>` +
    `<th scope=col>Omitidas</th><th scope=col>Errores</th>` +
    (`<th scope=col>Estado</th></tr>` +
      temas
        .map((tema, i) => {
          const progreso = perfil.u[i];
          if (!progreso)
            return (
              `<tr><th scope=row>P${i + 1}<small>${escaparHTML(tema.t)}</small>` +
              `</th>${"<td>–</td>".repeat(11)}<td>Sin iniciar</td>` +
              `</tr>`
            );
          const notasActividad = progreso.sc || [];
          const omitidasActividad = progreso.sk || [];
          const notaP = progreso.done ? notaPeriodo(progreso) : null;
          const ajustada = progreso.done && typeof progreso.ov === "number";
          return (
            `<tr><th scope=row>P${i + 1}<small>${escaparHTML(tema.t)}</small>` +
            (`</th>` +
              ACTIVIDADES_CORTAS.map(
                (_, j) =>
                  `<td>` +
                  (j < 5 && omitidasActividad[j]
                    ? "<span class=om-t>Omitida</span>"
                    : typeof notasActividad[j] === "number"
                      ? chipNota(notasActividad[j])
                      : "–") +
                  `</td>`,
              ).join("") +
              `<td>${notaP == null ? "–" : chipNota(notaP)}</td>`) +
            `<td>${notaP == null ? "–" : nivel(notaP)}</td><td>${suma(progreso.h || [])}</td>` +
            (`<td>${suma(omitidasActividad)}</td><td>${+progreso.e || 0}</td>` +
              (`<td>` +
                (progreso.done
                  ? ajustada
                    ? `Ajustada ✎<small>calculada ` +
                      notaPeriodo({ sc: notasActividad }).toFixed(1) +
                      `</small>`
                    : "Completado"
                  : "En curso · " + PASOS_CORTOS[Math.min(6, +progreso.step || 0)]) +
                `</td>`)) +
            `</tr>`
          );
        })
        .join("") +
      `</table>`) +
    `</div>
<div class=det__acts><button class=btn data-a=repstu data-i="${claveEsc}">⬇ Descargar reporte del estudiante</button>` +
    `<button class=b2 data-a=dsel data-i="">Cerrar detalle</button>` +
    `</div></section>`
  );
};
/* ---------- 10. VISTAS (vistas) ---------- */
/** Vistas de la app: cada método devuelve el HTML de la pantalla (la clave es el valor de vistaActual). */
const vistas = {
  /** Portada oficial del OVA (primera vista). */
  cover() {
    return (
      `<main class=cover><section class=portada aria-labelledby=titulo-ova>` +
      `<div class=portada__texto><p class=portada__sobretitulo>Objeto Virtual de Aprendizaje · Grados 10° y 11°</p>` +
      `<h1 id=titulo-ova class=portada__titulo>${BRAND}</h1>` +
      `<p class=portada__subtitulo>Filosofía e informática global</p>` +
      `<p class=portada__descripcion>Un recorrido interactivo para descubrir cómo las grandes preguntas de la filosofía dialogan con los algoritmos, las máquinas y el mundo digital que habitamos.</p>` +
      `<div class=portada__acciones><button class="btn btn--lg" data-a=home>` +
      `<span>Continuar</span><span class=btn__flecha aria-hidden=true>→</span>` +
      `</button><p class=portada__nota>Duración estimada: 45 minutos</p>` +
      `</div></div><div class=visual><div class=visual__radar aria-hidden=true>` +
      `</div><div class="visual__anillo visual__anillo--externo" aria-hidden=true>` +
      `</div><div class="visual__anillo visual__anillo--interno" aria-hidden=true>` +
      `</div><div class=orbita aria-hidden=true>` +
      `<span class="orbita__ficha orbita__ficha--arriba">φ</span>` +
      `<span class="orbita__ficha orbita__ficha--derecha">01</span>` +
      `<span class="orbita__ficha orbita__ficha--abajo">∴</span>` +
      `<span class="orbita__ficha orbita__ficha--izquierda">{ }</span>` +
      `</div><img class=visual__nucleo src="${LOGO}" width=412 height=527 alt="Escudo de SOPHIALAP: columna jónica con circuitos, corona de laurel, red neuronal y globo terráqueo en violeta y dorado">` +
      `</div></section><section class=ejes aria-labelledby=titulo-ejes>` +
      `<h2 id=titulo-ejes class=ejes__titulo>¿Qué vas a explorar?</h2>` +
      `<ul class=ejes__lista><li class=eje><img class=eje__icono src="assets/detalle-columna.png" width=64 height=64 alt="Columna jónica con líneas de circuito, símbolo de la lógica clásica y la computación">` +
      `<h3 class=eje__nombre>Lógica y razonamiento</h3>` +
      `<p class=eje__texto>Del silogismo de Aristóteles al pensamiento algorítmico.</p>` +
      `</li><li class=eje><img class=eje__icono src="assets/detalle-red.png" width=64 height=64 alt="Red neuronal de nodos violetas y dorados que representa la mente y la máquina">` +
      `<h3 class=eje__nombre>Mente y máquina</h3>` +
      `<p class=eje__texto>¿Puede pensar una computadora? Conciencia e inteligencia artificial.</p>` +
      `</li><li class=eje><img class=eje__icono src="assets/detalle-globo.png" width=64 height=64 alt="Globo terráqueo sobre una corona de laurel que representa la ética en el mundo digital">` +
      `<h3 class=eje__nombre>Ética digital</h3>` +
      `<p class=eje__texto>Datos, privacidad y responsabilidad en un mundo conectado.</p>` +
      `</li></ul></section></main>`
    );
  },
  /** Acceso docente (o aviso de que no está disponible sin servidor). */
  login() {
    if (LOCAL_ONLY)
      return (
        `<main><button class="b2 back" data-a=home>← Inicio</button>` +
        `<p class=ey>Panel docente</p><h1>Acceso docente</h1>` +
        `<div class=card><h2>No disponible en esta versión</h2>` +
        `<p class=mut>El panel docente necesita el servidor de ${BRAND} para guardar la lista de estudiantes y los recursos en la nube. Esta versión publicada funciona sin servidor: cada estudiante guarda su progreso en su propio dispositivo.</p>` +
        `</div></main>`
      );
    return (
      `<main><button class="b2 back" data-a=home>← Inicio</button>` +
      `<p class=ey>Panel docente</p><h1>Acceso docente</h1>` +
      `<p class=mut>Inicia sesión para consultar la lista y administrar recursos sincronizados.</p>` +
      `<div class=card><label>Usuario docente<input id=us autocomplete=username autocapitalize=off spellcheck=false>` +
      `</label><label>Contraseña<input id=pw type=password autocomplete=current-password>` +
      (`</label>` +
        (mensajeError ? `<p class=err>${escaparHTML(mensajeError)}</p>` : "") +
        (teacherLoadError ? `<p class=err>${escaparHTML(teacherLoadError)}</p>` : "") +
        `<button class=btn data-a=lg>Entrar</button>`) +
      `</div></main>`
    );
  },
  /** Inicio: elegir o crear perfil, código personal y cómo funciona. */
  home() {
    const perfiles = Object.entries(estado.p);
    const conCodigo = perfiles.filter(([, perfil]) => perfil && perfil.accessCode);
    return (
      `<main><div class=intro><p class=ey>Filosofía · Educación media</p>` +
      `<h1>Aprende a <em>filosofar.</em></h1><p class="mut lead">Recorre los cuatro periodos, practica con cinco actividades por periodo y fortalece tu pensamiento crítico, dialógico y creativo.</p>` +
      (`</div><section class=card><h2>¿Quién va a estudiar?</h2>` +
        (perfiles.length
          ? `<p class=mut>Continuar como:</p>` +
            perfiles
              .map(
                ([clave, perfil]) =>
                  `<button class=chip data-a=use data-i="${escaparHTML(clave)}">${escaparHTML(perfil.name)} · ${perfil.grade}°</button>`,
              )
              .join("") +
            `<p class=mut>o crea un perfil nuevo:</p>`
          : "") +
        `<div class=row>`) +
      `<label>Nombre<input id=nm value="${escaparHTML(nombreFormulario)}" placeholder="Escribe tu nombre" autocomplete=off>` +
      `</label><label>Grado<select id=gr><option value="">Selecciona</option>` +
      `<option value=10 ${gradoFormulario === "10" ? "selected" : ""}>10°</option>` +
      `<option value=11 ${gradoFormulario === "11" ? "selected" : ""}>11°</option>` +
      (`</select></label></div>` +
        (mensajeError ? `<p class=err>${escaparHTML(mensajeError)}</p>` : "") +
        (LOCAL_ONLY
          ? ""
          : `<p class=server-note>¿Ya tienes un código personal? Abre tu perfil desde cualquier dispositivo.</p>` +
            `<div class=access-row><label>Código personal<input id=ac autocomplete=off inputmode=text placeholder="Pega tu código de acceso">` +
            `</label><button class=btn data-a=access ${accessBusy ? "disabled" : ""}>Abrir mi perfil</button>` +
            (`</div>` + (accessBusy ? `<p class=mut>Conectando con tu perfil…</p>` : ""))) +
        (issuedCode
          ? `<div class=code-box role=status><div><strong>Guarda tu código personal</strong>` +
            `<p>Úsalo para continuar en otro dispositivo.</p>` +
            (`<code>${escaparHTML(issuedCode)}</code></div>` +
              `<button class=b2 data-a=copy-code>Copiar código</button>`) +
            `</div>`
          : "") +
        `</section>` +
        (conCodigo.length
          ? `<section class=card id=saved-profile-codes>` +
            (`<h2>Códigos personales guardados</h2><p class=mut>Disponibles en este dispositivo para abrir cada perfil en otro equipo.</p>` +
              conCodigo
                .map(
                  ([clave, perfil]) =>
                    `<div class=code-box><div><strong>${escaparHTML(perfil.name)} · ${perfil.grade}°</strong>` +
                    `<br><code>${escaparHTML(perfil.accessCode)}</code></div>` +
                    `<button class=b2 data-a=copy-saved data-i="${escaparHTML(clave)}" aria-label="Copiar código personal de ${escaparHTML(perfil.name)}">Copiar código</button>` +
                    `</div>`,
                )
                .join("") +
              `</section>`)
          : "") +
        `<p class=mut>Tu progreso queda guardado en este dispositivo` +
        (LOCAL_ONLY ? "." : " y se sincroniza cuando hay conexión.") +
        `</p>`) +
      `<div class=sum style="margin:26px 0"><span>` +
      `<strong>4</strong>periodos por grado</span>` +
      `<span><strong>5</strong>actividades por periodo</span>` +
      `<span><strong>3</strong>competencias</span>` +
      `<span><strong>1.0–5.0</strong>escala de nota</span>` +
      (`</div><p class=ey>Cómo funciona</p><div class=rg>` +
        [
          [
            "📖",
            "Lee la teoría",
            "Ideas clave, ejemplos y explicaciones. Puedes volver a ella cuando quieras.",
          ],
          ["🧩", "Practica", "Cinco actividades por periodo, una de ellas propia de cada tema."],
          ["⚖️", "Obtén tu nota", "Cada actividad pesa distinto, y las pistas también cuentan."],
          ["🧭", "Recorre la ruta", "Los 4 periodos se encadenan para repasar todo el año."],
        ]
          .map(
            (tarjeta) =>
              `<div class=card><span class=ic aria-hidden=true>${tarjeta[0]}</span>` +
              `<h2>${tarjeta[1]}</h2><p class=mut>${tarjeta[2]}</p>` +
              `</div>`,
          )
          .join("") +
        `</div>`) +
      `<section class="card cta"><h2>¿Listo para empezar?</h2>` +
      (`<p class=mut>Escribe tu nombre y elige tu grado en el recuadro de arriba.</p>` +
        (mensajeError ? `<p class=err>${escaparHTML(mensajeError)}</p>` : "") +
        `<button class=btn data-a=start>Comenzar</button>` +
        (perfiles.length ? `<button class=b2 data-a=wipe>Borrar mis datos</button>` : "") +
        `</section>`) +
      `</main>`
    );
  },
  /** Ruta de periodos: camino vertical con nodos y estado en texto. */
  map() {
    const temas = periodosDelGrado();
    const completados = temas.filter((_, i) => periodoTerminado(i)).length;
    return (
      `<main><p class=ey>Ruta de repaso</p><h1>Recorre los 4 periodos.</h1>` +
      `<section class=card><p class=ey>${escaparHTML(usuario.name)} · ${usuario.grade}°</p>` +
      (`<h2>${completados} de 4 periodos recorridos</h2>` +
        `<p class=mut>Nota acumulada: <strong>${notaFinalTexto(usuario)}</strong>${completados < 4 ? " (parcial)" : ""}</p>${barraProgreso(completados * 25, "Avance")}` +
        (completados == 4 ? `<button class=btn data-a=final>Ver resultado final</button>` : "") +
        `</section>`) +
      (`<ol class=route aria-label="Periodos del año">` +
        temas
          .map((datosPeriodo, i) => {
            const bloqueado = i && !periodoTerminado(i - 1);
            const paso = (usuario.u[i] || { step: 0 }).step;
            const avancePeriodo = periodoTerminado(i) ? 100 : (paso / 6) * 100;
            const clase = periodoTerminado(i)
              ? "is-done"
              : bloqueado
                ? "is-locked"
                : paso > 0
                  ? "is-active"
                  : "is-open";
            const etiqueta = periodoTerminado(i)
              ? "Completado · " + notaPeriodo(usuario.u[i]).toFixed(1)
              : bloqueado
                ? "Bloqueado"
                : paso > 0
                  ? "En curso"
                  : "Disponible";
            return (
              `<li class="node ${clase}" style="--n:${i}">` +
              `<span class=node__dot aria-hidden=true>${i + 1}</span>` +
              (`<button class=node__card data-a=open data-i=${i} ` +
                (bloqueado
                  ? 'aria-disabled=true data-hint="Este periodo está bloqueado. Completa el anterior."'
                  : "") +
                `>`) +
              (`<span class=node__state>${etiqueta}</span>` +
                `<span class=node__title>Periodo ${i + 1}</span>`) +
              `<span class=node__topic><strong>${datosPeriodo.t}</strong>` +
              (`<br>${datosPeriodo.q}</span>` +
                barraProgreso(avancePeriodo, "Avance periodo " + (i + 1)) +
                `</button>`) +
              `</li>`
            );
          })
          .join("") +
        `</ol>`) +
      `</main>`
    );
  },
  /** Periodo abierto: teoría, las cinco actividades y el resumen, según el paso. */
  unit() {
    const datosPeriodo = periodosDelGrado()[periodoActual];
    const progreso = progresoPeriodo(periodoActual);
    const paso = progreso.step;
    const reto = RETOS[usuario.grade][periodoActual];
    let cuerpo = "";
    if (paso == 0)
      cuerpo = vistaTeoria(datosPeriodo) + `<button class=btn data-a=nx>Ir a las actividades</button>`;
    else if (paso == 1) {
      if (!estadoOrdenar) estadoOrdenar = { pool: barajar(datosPeriodo.o.map((_, i) => i)), sl: [] };
      cuerpo =
        `<div class=card><h2>Actividad 1 · ${datosPeriodo.an || "Ordena el razonamiento"}</h2>` +
        `<p class=mut>${datosPeriodo.ai || "Toca los pasos en el orden correcto."} Toca un paso colocado para devolverlo.</p>` +
        (`<div class=bl role=group aria-label="Pasos por ordenar">` +
          estadoOrdenar.pool
            .map((i) => `<button class=blk data-a=dp data-i=${i}>${datosPeriodo.o[i]}</button>`)
            .join("") +
          `</div>`) +
        (`<div role=group aria-label="Tu orden">` +
          estadoOrdenar.sl
            .map(
              (i, n) =>
                `<div class=slot data-n=${n + 1}><button class=blk data-a=dr data-i=${i} aria-label="Posición ${n + 1}: ${escaparHTML(datosPeriodo.o[i])}. Actívalo para devolverlo a la lista.">${datosPeriodo.o[i]}</button>` +
                `</div>`,
            )
            .join("") +
          `</div>${bloqueRetroalimentacion()}<button class=btn data-a=dc ` +
          (estadoOrdenar.pool.length
            ? 'aria-disabled=true data-hint="Coloca todos los pasos para poder comprobar."'
            : "") +
          `>Comprobar</button>`) +
        `</div>`;
    } else if (paso == 2)
      cuerpo = vistaPreguntas(
        2,
        "Actividad 2 · Verdadero o falso razonado",
        "Decide si cada frase es verdadera o falsa. Un error trae una pista.",
        "v",
        progreso,
      );
    else if (paso == 3)
      cuerpo = vistaPreguntas(
        3,
        "Actividad 3 · " + reto.n,
        INSTRUCCIONES_RETO[reto.ty] + " Un error trae una pista.",
        "q",
        progreso,
      );
    else if (paso == 4) {
      const dilema = progreso.a.d || { pos: -1, arg: "", obj: "" };
      cuerpo =
        `<div class=card><h2>Actividad 4 · Dilema y debate</h2>` +
        (`<p id=dq>${datosPeriodo.d[0]}</p><div role=group aria-labelledby=dq>` +
          [1, 2]
            .map(
              (j, n) =>
                `<button class="opt ${dilema.pos === n ? "sel" : ""}" aria-pressed=${dilema.pos === n} data-a=pos data-i=${n}>${datosPeriodo.d[j]}</button>`,
            )
            .join("") +
          `</div>`) +
        `<div class=write><label for=ta id=lta>Tu argumento (mínimo ${minimoDilema()} caracteres)</label>` +
        (`<textarea id=ta rows=4 aria-labelledby=lta aria-describedby=cnt-ta>${escaparHTML(dilema.arg || "")}</textarea>` +
          contadorCaracteres("ta", dilema.arg, minimoDilema()) +
          `<label for=tb id=ltb>Alguien piensa lo contrario: ¿qué te diría y qué le respondes? (mínimo ${minimoDilema()} caracteres)</label>`) +
        (`<textarea id=tb rows=4 aria-labelledby=ltb aria-describedby=cnt-tb>${escaparHTML(dilema.obj || "")}</textarea>` +
          contadorCaracteres("tb", dilema.obj, minimoDilema()) +
          `</div>`) +
        `<button id=nxb class=btn data-a=nx ${actividadCompleta() ? "" : atributosBloqueo()}>Continuar</button>` +
        `</div>`;
    } else if (paso == 5)
      cuerpo =
        `<div class=card><h2>Actividad 5 · Creación</h2>` +
        (`<p>${datosPeriodo.c}</p><div class=write>` +
          `<label for=tc id=ltc>Tu respuesta (mínimo ${minimoCreacion()} caracteres)</label>`) +
        (`<textarea id=tc rows=7 aria-labelledby=ltc aria-describedby=cnt-tc>${escaparHTML(progreso.a.c || "")}</textarea>` +
          contadorCaracteres("tc", progreso.a.c, minimoCreacion()) +
          `</div>`) +
        `<button id=nxb class=btn data-a=nx ${actividadCompleta() ? "" : atributosBloqueo()}>Continuar</button>` +
        `</div>`;
    else {
      const pistasUsadas = progreso.h.reduce((x, y) => x + y, 0);
      const notaPistas = Math.max(1, redondear1(5 - 0.25 * pistasUsadas));
      const notas = progreso.sc.slice(0, 5).concat([notaPistas]);
      const nota = notaPeriodo({ sc: notas });
      const nivelTexto = nivel(nota);
      cuerpo =
        `<div class=card><h2>Resumen del periodo</h2>` +
        NOMBRES_ACTIVIDADES.slice(0, 5)
          .map(
            (n, k) =>
              `<div class=ps><b>${PESOS[k] * 100}%</b>${n}<small>` +
              (progreso.sk[k] ? "omitida · 1.0" : notas[k] != null ? notas[k].toFixed(1) : "–") +
              ` · pistas: ${progreso.h[k]}</small>` +
              `</div>`,
          )
          .join("") +
        `<div class=ps>` +
        `<b>10%</b>Pistas<small>${notaPistas.toFixed(1)} · ${pistasUsadas} usadas</small>` +
        (`</div><h2 class=grade-h>Nota del periodo: <strong data-count="${nota.toFixed(1)}">${nota.toFixed(1)}</strong> · ${nivelTexto}</h2>` +
          NIVELES.map(
            (nombreNivel, indiceNivel) =>
              `<p class="${nombreNivel === nivelTexto ? "" : "mut"}">` +
              `<strong>${nombreNivel}.</strong> ${VERBOS_GRADO[usuario.grade]} los temas ${SUFIJOS_NIVEL[indiceNivel]}.</p>`,
          ).join("") +
          `<p class=mut style="font-size:.82rem">Los rangos (Superior 4.6–5.0, Alto 4.0–4.5, Básico 3.0–3.9, Bajo 1.0–2.9) pueden variar según el sistema de evaluación de tu colegio.</p>`) +
        `<button class=btn data-a=fin>Terminar periodo</button>` +
        `</div>`;
    }
    if (viendoTeoria)
      cuerpo = vistaTeoria(datosPeriodo) + `<button class=btn data-a=bk>← Volver a la actividad</button>`;
    return (
      `<main class=unit-head><button class="b2 back" data-a=map>← Ruta</button>` +
      `<p class=ey>Periodo ${periodoActual + 1} · ${usuario.grade}°</p>` +
      `<h1>${datosPeriodo.t}</h1><p class="mut lead">${datosPeriodo.q}</p>` +
      (`<ol class=steps aria-label="Pasos del periodo">` +
        ["Teoría", "Ordenar", "V/F", "Reto", "Dilema", "Creación", "Resumen"]
          .map(
            (nombrePaso, i) =>
              `<li class="pill ${i == paso ? "on" : i < paso ? "is-past" : ""}"${i == paso ? " aria-current=step" : ""}>${nombrePaso}` +
              (i == paso
                ? "<span class=sr> (paso actual)</span>"
                : i < paso
                  ? "<span class=sr> (hecho)</span>"
                  : "") +
              `</li>`,
          )
          .join("") +
        `</ol>${cuerpo}` +
        (!viendoTeoria && (paso == 4 || paso == 5) ? bloqueRetroalimentacion() : "") +
        (!viendoTeoria && paso > 0
          ? `<div class=helpers>` +
            (paso == 4 || paso == 5 ? `<button class=b2 data-a=hx>💡 Pedir pista</button>` : "") +
            `<button class=b2 data-a=th>📖 Volver a la teoría</button>` +
            (paso <= 5
              ? `<button class=b2 data-a=om>Omitir · vale ${PESOS[paso - 1] * 100}% de la nota</button>`
              : "") +
            `</div>`
          : "") +
        `</main>`)
    );
  },
  /** Resultado final al completar los cuatro periodos. */
  final() {
    const temas = periodosDelGrado();
    const pistasUsadas = temas.reduce(
      (n, _, i) => n + ((usuario.u[i] || { h: [] }).h || []).reduce((x, y) => x + y, 0),
      0,
    );
    return (
      `<main><p class=ey>Ruta completa</p><h1>¡Recorriste los <em>4 periodos!</em>` +
      `</h1><p class=mut>${escaparHTML(usuario.name)} · ${usuario.grade}°</p>` +
      `<div class=sum><span class=final-grade><strong data-count="${notaFinalTexto(usuario)}">${notaFinalTexto(usuario)}</strong>nota final</span>` +
      `<span><strong>${pistasUsadas}</strong>pistas usadas</span>` +
      `<span><strong>${omitidas(usuario)}</strong>omitidas</span>` +
      (`</div>` +
        temas
          .map((datosPeriodo, i) => {
            const progreso = usuario.u[i] || {};
            return (
              `<div class=ps><b>P${i + 1}</b>${datosPeriodo.t}<small>` +
              (progreso.done
                ? notaPeriodo(progreso).toFixed(1) + " · " + nivel(notaPeriodo(progreso))
                : "–") +
              ` · pistas: ${(progreso.h || []).reduce((x, y) => x + y, 0)}</small>` +
              `</div>`
            );
          })
          .join("") +
        `<button class=btn data-a=map>Repasar de nuevo</button>`) +
      `</main>`
    );
  },
  /** Panel docente: filtros, indicadores, gráficos, alertas, tabla, registro y recursos. */
  doc() {
    if (!teacherReady)
      return (
        `<main><div class=card><h1>Conectando con el panel docente…</h1>` +
        `<p class=mut>Se comprobará la sesión antes de solicitar la lista y los recursos.</p>` +
        `</div></main>`
      );
    // Tablero: el filtro (grado + búsqueda) define el grupo `filtrados` sobre el que se calculan KPIs, gráficos, alertas y tabla
    const mapa = teacherMap();
    const todos = Object.entries(mapa);
    const busqueda = normalizar(filtroDocente.q).trim();
    const filtrados = todos.filter(
      ([, perfil]) =>
        (!filtroDocente.g || perfil.grade === filtroDocente.g) &&
        (!busqueda || normalizar(perfil.name).includes(busqueda)),
    );
    const perfiles = filtrados.map(([, perfil]) => perfil);
    const total = perfiles.length;
    const notas = perfiles.map(notaFinal).filter((x) => x != null);
    const completadosPor = perfiles.map((perfil) => periodosTerminados(perfil).length);
    const rutaCompleta = completadosPor.filter((x) => x == 4).length;
    const periodosCompletos = suma(completadosPor);
    const pistasTotales = suma(perfiles.map(totalPistas));
    const omitidasTotales = suma(perfiles.map(omitidas));
    const distribucion = distribucionNiveles(perfiles);
    const grados = filtroDocente.g ? [filtroDocente.g] : ["10", "11"];
    /** Comparador por nombre normalizado. */
    const byName = (a, b) => normalizar(a.name).localeCompare(normalizar(b.name));
    if (estudianteSeleccionado && !mapa[estudianteSeleccionado]) estudianteSeleccionado = null;
    const seriesPeriodo = grados.map((g) => {
      const delGrado = perfiles.filter((perfil) => perfil.grade === g);
      /** Notas del periodo i de los estudiantes del grado. */
      const notasDelPeriodo = (periodo) =>
        delGrado
          .filter((perfil) => perfil.u[periodo] && perfil.u[periodo].done)
          .map((perfil) => notaPeriodo(perfil.u[periodo]));
      const promedios = [0, 1, 2, 3].map((i) => promedio(notasDelPeriodo(i)));
      return {
        g,
        c: "c" + g,
        v: promedios,
        tip: (i) => {
          const n = notasDelPeriodo(i).length;
          return `Grado ${g}° · P${i + 1} ${escaparHTML(PERIODOS[g][i].t)}: ${n ? promedios[i].toFixed(1) : "sin datos"} (${n} ${n == 1 ? "estudiante" : "estudiantes"})`;
        },
      };
    });
    const seriesActividad = ACTIVIDADES_CORTAS.map((a, k) => {
      const valores = perfiles
        .flatMap((perfil) => periodosTerminados(perfil).map((progreso) => (progreso.sc || [])[k]))
        .filter((x) => typeof x === "number");
      const omisiones =
        k < 5
          ? suma(
              perfiles.map((perfil) =>
                suma(Object.values(perfil.u).map((progreso) => (progreso.sk || [])[k])),
              ),
            )
          : 0;
      const media = promedio(valores);
      return {
        l: a,
        v: media,
        t:
          `${NOMBRES_ACTIVIDADES[k]}: promedio ${formatoNota(media)} en ${valores.length} periodos terminados` +
          (k < 5 ? " · omitida " + omisiones + (omisiones == 1 ? " vez" : " veces") : ""),
        x: omisiones ? omisiones + " omit." : "",
      };
    });
    const avanceEstudiantes = [...filtrados]
      .sort(([, a], [, b]) => {
        const x = notaFinal(a);
        const y = notaFinal(b);
        return x == null && y == null ? byName(a, b) : x == null ? 1 : y == null ? -1 : y - x || byName(a, b);
      })
      .map(([k, perfil]) => {
        const completados = periodosTerminados(perfil).length;
        const g = notaFinal(perfil);
        return {
          l:
            `<button class=hb__btn data-a=dsel data-i="${escaparHTML(k)}" aria-label="Ver detalle de ${escaparHTML(perfil.name)}">${escaparHTML(perfil.name)} <small>${perfil.grade}° · ${completados}/4</small>` +
            `</button>`,
          v: g,
          t: `${escaparHTML(perfil.name)} · ${perfil.grade}° · nota ${formatoNota(g)}${g != null ? " (" + nivel(g) + ")" : ""} · ${completados} de 4 periodos`,
          x: completados < 4 && g != null ? "parcial" : "",
        };
      });
    const alertas = filtrados
      .map(([k, perfil]) => [k, perfil, alertasEstudiante(perfil)])
      .filter((x) => x[2].length)
      .map((x) => ((x[3] = suma(x[2].map((a) => (a[0] === "j" ? 2 : 1)))), x))
      .sort((a, b) => b[3] - a[3] || byName(a[1], b[1]));
    const CRITERIOS_ORDEN = {
      name: (perfil) => normalizar(perfil.name),
      grade: (perfil) => +perfil.grade,
      nota: notaFinal,
      avance: avanceRuta,
    };
    const criterio = CRITERIOS_ORDEN[ordenDocente.k] || CRITERIOS_ORDEN.name;
    const filas = [...filtrados].sort(([, a], [, b]) => {
      const x = criterio(a);
      const y = criterio(b);
      if (x == null || y == null) return x == null && y == null ? byName(a, b) : x == null ? 1 : -1;
      return (x < y ? -1 : x > y ? 1 : 0) * ordenDocente.d || byName(a, b);
    });
    /** Encabezado de tabla con botón para ordenar por la clave dada. */
    const encabezadoOrden = (clave, etiqueta) => {
      const activo = ordenDocente.k === clave;
      return (
        `<th scope=col aria-sort=` +
        (activo ? (ordenDocente.d > 0 ? "ascending" : "descending") : "none") +
        `>` +
        (`<button class=sortb data-a=dsort data-i=${clave}>${etiqueta}<span class=sortb__i aria-hidden=true>` +
          (activo ? (ordenDocente.d > 0 ? "▲" : "▼") : "⇅") +
          `</span>`) +
        `</button></th>`
      );
    };
    return (
      `<main><button class="b2 back" data-a=home>← Inicio</button>` +
      `<div class=sh><div><p class=ey>Panel docente · Nube</p>` +
      `<h1>Seguimiento de estudiantes</h1><p class=mut>Lista, notas y recursos compartidos entre tus dispositivos.</p>` +
      `</div><div><button class=btn data-a=rep>⬇ Informe HTML</button>` +
      `<button class=b2 data-a=csv>⬇ Excel (CSV)</button>` +
      `<button class=b2 data-a=logout>Cerrar sesión</button>` +
      (`</div></div>
` +
        (issuedCode
          ? `<div class=code-box role=status><div><strong>Código personal de ${escaparHTML(issuedCodeName || "estudiante")}</strong>` +
            `<p>Compártelo de forma privada; permite acceder a ese perfil.</p>` +
            (`<code>${escaparHTML(issuedCode)}</code></div>` +
              `<button class=b2 data-a=copy-code>Copiar código</button>`) +
            `</div>`
          : "") +
        `
<section class="card dfil" aria-label="Filtros del tablero">`) +
      (`<div class=seg role=group aria-label="Filtrar por grado">` +
        [
          ["", "Todos"],
          ["10", "10°"],
          ["11", "11°"],
        ]
          .map(
            ([g, etiqueta]) =>
              `<button class="b2 seg__b" data-a=dfg data-i="${g}" aria-pressed=${filtroDocente.g === g}>${etiqueta}</button>`,
          )
          .join("") +
        `</div>`) +
      `<label class=dfil__q>Buscar por nombre<input id=dsq type=search value="${escaparHTML(filtroDocente.q)}" placeholder="Escribe un nombre…" autocomplete=off>` +
      (`</label><p class="mut dfil__n">Mostrando <strong>${total}</strong> de ${todos.length} estudiantes` +
        (filtroDocente.g ? " · grado " + filtroDocente.g + "°" : "") +
        (busqueda ? ` · búsqueda “${escaparHTML(filtroDocente.q.trim())}”` : "") +
        `. Los indicadores y gráficos responden a este filtro.</p>`) +
      `</section>
<div class=tl><div><strong>${total}</strong>` +
      (`<span>estudiantes` + (total !== todos.length ? " (de " + todos.length + ")" : "") + `</span>`) +
      `</div><div><strong>${formatoNota(promedio(notas))}</strong>` +
      (`<span>promedio general` +
        (notas.length < total ? " · " + notas.length + " con nota" : "") +
        `</span>`) +
      `</div><div><strong>${porcentaje(rutaCompleta, total)}%</strong>` +
      `<span>completó la ruta · ${rutaCompleta} de ${total}</span>` +
      `</div><div><strong>${periodosCompletos}<small>/${total * 4}</small>` +
      `</strong><span>periodos completados</span>` +
      (`</div><div><strong>` + (total ? (pistasTotales / total).toFixed(1) : "–") + `</strong>`) +
      `<span>pistas promedio por estudiante</span>` +
      `</div><div><strong>${omitidasTotales}</strong><span>actividades omitidas</span>` +
      `</div><div class=tl__dist><span>Distribución por nivel</span>` +
      (`<span class=stk role=img aria-label="Distribución por nivel: ` +
        NIVELES.map((etiqueta) => etiqueta + " " + distribucion[etiqueta]).join(", ") +
        `, sin nota ${distribucion.sin}">` +
        [
          ["Superior", "ls"],
          ["Alto", "la"],
          ["Básico", "lb"],
          ["Bajo", "lj"],
          ["sin", "ln"],
        ]
          .map(([etiqueta, clase]) =>
            distribucion[etiqueta]
              ? `<i class=${clase} style="flex:${distribucion[etiqueta]}" title="${etiqueta === "sin" ? "Sin nota" : etiqueta}: ${distribucion[etiqueta]}">` +
                `</i>`
              : "",
          )
          .join("") +
        `</span>`) +
      (`<span class=stk__lg aria-hidden=true>` +
        NIVELES.map(
          (etiqueta) => `<b class="nv ${CLASE_NIVEL[etiqueta]}">${etiqueta} ${distribucion[etiqueta]}</b>`,
        ).join("") +
        (distribucion.sin ? `<b class=nv>Sin nota ${distribucion.sin}</b>` : "") +
        `</span>`) +
      `</div></div>
<div class=dg><section class="card chart-card">` +
      `<h2>Distribución por nivel</h2><p class=mut>Estudiantes según su nota final.</p>${barrasVerticales(distribucion)}</section>
<section class="card chart-card">` +
      (`<h2>Promedio por periodo</h2><p class=mut>Nota media de los periodos terminados, por grado.</p>` +
        graficoBarrasSVG(
          ["P1", "P2", "P3", "P4"],
          seriesPeriodo,
          "cp",
          "Promedio por periodo y grado",
          seriesPeriodo
            .map(
              (serie) =>
                `Grado ${serie.g}°: ` + serie.v.map((x, i) => `P${i + 1} ${formatoNota(x)}`).join(", "),
            )
            .join(". "),
        ) +
        `<p class=cleg>` +
        grados.map((g) => `<span><i class=c${g}></i>Grado ${g}°</span>`).join("") +
        `</p>`) +
      `</section>
<section class="card chart-card">` +
      `<h2>Promedio por actividad</h2><p class=mut>Escala 1.0–5.0 en los periodos terminados; color según el nivel.</p>${barrasHorizontales(seriesActividad)}</section>
<section class="card chart-card">` +
      `<h2>Alertas <span class=pill>${alertas.length}</span>` +
      (`</h2><p class=mut>Nivel Bajo o Básico, muchas pistas, omisiones o sin avance.</p>` +
        (alertas.length
          ? `<ul class=al>` +
            alertas
              .map(
                ([k, perfil, a, gravedad]) =>
                  `<li class="` +
                  (gravedad >= 2 && a.some((x) => x[0] === "j") ? "is-j" : "") +
                  `">` +
                  `<div><strong>${escaparHTML(perfil.name)}</strong> <span class=pill>${perfil.grade}°</span>` +
                  (`<div class=al__t>` +
                    a
                      .map(([clase, texto]) => `<span class="nv ${clase}">${escaparHTML(texto)}</span>`)
                      .join("") +
                    `</div>`) +
                  `</div><button class=b2 data-a=dsel data-i="${escaparHTML(k)}" aria-label="Ver detalle de ${escaparHTML(perfil.name)}">Ver detalle</button>` +
                  `</li>`,
              )
              .join("") +
            `</ul>`
          : `<p class=al-ok>Sin alertas: ningún estudiante requiere atención especial con los filtros actuales.</p>`) +
        `</section>`) +
      `</div>
<section class=card><h2>Avance de cada estudiante</h2>` +
      (`<p class=mut>Nota final de mayor a menor (las barras muestran la escala 1.0–5.0). Toca un nombre para ver su detalle.</p>` +
        barrasHorizontales(avanceEstudiantes, "hb--stu") +
        `</section>
` +
        (estudianteSeleccionado
          ? detalleEstudiante(estudianteSeleccionado, mapa[estudianteSeleccionado])
          : "") +
        `
<section class=card>`) +
      `<h2>Estudiantes</h2><p class=mut>Ordena con los encabezados. Haz clic en una fila o en «Ver detalle» para abrir el detalle del estudiante.</p>` +
      `<div class=leg><span class="nv s">Superior 4.6–5.0</span>` +
      `<span class="nv a">Alto 4.0–4.5</span><span class="nv b">Básico 3.0–3.9</span>` +
      `<span class="nv j">Bajo 1.0–2.9</span></div>` +
      `<div class=tw><table class=dt><caption class=sr>Seguimiento de estudiantes</caption>` +
      `<tr>${encabezadoOrden("name", "Estudiante")}${encabezadoOrden("grade", "Grado")}${encabezadoOrden("avance", "Avance")}<th scope=col>P1</th>` +
      `<th scope=col>P2</th><th scope=col>P3</th>` +
      `<th scope=col>P4</th>${encabezadoOrden("nota", "Final")}<th scope=col>Acciones</th>` +
      (`</tr>` +
        (filas
          .map(([k, perfil]) => {
            const completados = periodosTerminados(perfil).length;
            const g = notaFinal(perfil);
            return (
              `<tr class="dt__row${estudianteSeleccionado === k ? " is-sel" : ""}" data-a=dsel data-i="${escaparHTML(k)}">` +
              `<td><span class=nm>${escaparHTML(perfil.name)}</span>` +
              `</td><td><span class=pill>${perfil.grade}°</span>` +
              (`</td><td style="min-width:120px">` +
                barraProgreso(completados * 25, "Avance de " + escaparHTML(perfil.name)) +
                `<small class=mut>${completados} de 4 periodos</small>`) +
              (`</td>` +
                [0, 1, 2, 3]
                  .map((i) => {
                    const progreso = perfil.u[i];
                    return (
                      `<td>` +
                      (progreso && progreso.done
                        ? chipNota(notaPeriodo(progreso)) +
                          (typeof progreso.ov === "number" ? "✎<span class=sr> (nota ajustada)</span>" : "")
                        : "–") +
                      `</td>`
                    );
                  })
                  .join("") +
                `<td>${g == null ? "–" : chipNota(g)}</td>`) +
              `<td class=dt__acts><button class=b2 data-a=dsel data-i="${escaparHTML(k)}" aria-label="Ver detalle de ${escaparHTML(perfil.name)}">Ver detalle</button>` +
              `<button class=b2 data-a=repstu data-i="${escaparHTML(k)}" aria-label="Descargar reporte de ${escaparHTML(perfil.name)}">Reporte</button>` +
              `<button class=b2 data-a=tedit data-i="${escaparHTML(k)}" aria-label="Editar a ${escaparHTML(perfil.name)}">Editar</button>` +
              `<button class=b2 data-a=adj data-i="${escaparHTML(k)}" aria-label="Ajustar nota de ${escaparHTML(perfil.name)}">Ajustar nota</button>` +
              (`<button class=b2 data-a=drm data-i="${escaparHTML(k)}" aria-label="Quitar a ${escaparHTML(perfil.name)}">Quitar</button>` +
                (estado.teacherCodes[k]
                  ? `<button class=b2 data-a=show-teacher-code data-i="${escaparHTML(k)}" aria-label="Ver código personal de ${escaparHTML(perfil.name)}">Ver código</button>`
                  : "") +
                `</td>`) +
              `</tr>`
            );
          })
          .join("") ||
          `<tr><td colspan=9>` +
            (todos.length
              ? "Ningún estudiante coincide con el filtro."
              : "Aún no hay estudiantes. Registra al grupo o migra perfiles locales desde el inicio.") +
            `</td>` +
            `</tr>`) +
        `</table>`) +
      `</div></section>
<section class=card><h2>Registrar estudiante</h2>` +
      `<div class=reg><label>Nombre<input id=sn maxlength=120 autocomplete=off>` +
      `</label><label>Grado<select id=sg><option value=10>10°</option>` +
      `<option value=11>11°</option></select></label>` +
      `<button class=btn data-a=dadd>Registrar</button>` +
      `</div></section>${vistaRecursosDocente()}
<section class=card>` +
      `<h2>Datos de estudiantes</h2><p class=mut>Los cambios se guardan en el servicio compartido de ${BRAND}.</p>` +
      `<button class="b2 b2--danger" data-a=wall>🗑 Borrar todos los datos</button>` +
      `</section></main>`
    );
  },
};
/* ---------- 11. RENDER Y NAVEGACIÓN ---------- */
/** Dibuja la vista actual en #app y restaura el foco (pendiente, título o el control previo). */
const render = (nav) => {
  const activo = document.activeElement;
  const focoPrevio =
    activo && activo.closest && activo.closest("#app")
      ? { a: activo.dataset.a, i: activo.dataset.i, id: activo.id }
      : null;
  const selectorFoco = focoPendiente;
  focoPendiente = null;
  const contenedor = $("#app");
  contenedor.innerHTML = cabecera() + vistas[vistaActual]() + pie();
  const recorrido = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT);
  const nodosTexto = [];
  while (recorrido.nextNode()) nodosTexto.push(recorrido.currentNode);
  nodosTexto.forEach((nodo) => {
    if (nodo.parentNode.tagName === "TEXTAREA") return;
    const partes = nodo.nodeValue.split(RE_EMOJI_PARTIR);
    if (partes.length < 2) return;
    const fragmento = document.createDocumentFragment();
    partes.forEach((t, i) => {
      if (!t) return;
      if (i % 2) {
        const e = document.createElement("span");
        e.setAttribute("aria-hidden", "true");
        e.textContent = t;
        fragmento.appendChild(e);
      } else fragmento.appendChild(document.createTextNode(t));
    });
    nodo.replaceWith(fragmento);
  });
  const principal = $("#app main");
  if (principal) {
    principal.id = "main";
    principal.tabIndex = -1;
  }
  // Entrada escalonada solo cuando cambia la vista o el paso (no en cada clic dentro de la misma pantalla)
  const claveVista =
    vistaActual +
    "|" +
    periodoActual +
    "|" +
    (vistaActual === "unit" && usuario && usuario.u[periodoActual] ? usuario.u[periodoActual].step : "") +
    "|" +
    viendoTeoria;
  const esNuevaVista = claveVista !== ultimaVista;
  ultimaVista = claveVista;
  if (principal && esNuevaVista) {
    principal.classList.add("enter");
    principal.querySelectorAll("[data-count]").forEach(countUp);
  }
  const titulo = $("#app h1");
  if (titulo) titulo.tabIndex = -1;
  document.title =
    vistaActual === "cover"
      ? BRAND + " · Filosofía e informática global"
      : (titulo ? titulo.textContent + " · " : "") + BRAND;
  document.documentElement.style.setProperty("--u", estado.u);
  let t = null;
  if (selectorFoco) t = $(selectorFoco);
  else if (nav && titulo) t = titulo;
  else if (focoPrevio) {
    t =
      [...document.querySelectorAll("#app [data-a]")].find(
        (e) => focoPrevio.a && e.dataset.a === focoPrevio.a && e.dataset.i === focoPrevio.i,
      ) ||
      (focoPrevio.id && document.getElementById(focoPrevio.id)) ||
      titulo;
  }
  if (t) {
    if (!t.matches("button,a,input,select,textarea")) t.tabIndex = -1;
    t.focus({ preventScroll: t === titulo });
    // Microinteracciones: acierto (rebote), error (sacudida), pista (aparición) y paso colocado (escala)
    if (selectorFoco && t.classList.contains("fb"))
      t.classList.add(
        t.classList.contains("ok") ? "fx-ok" : t.classList.contains("hint") ? "fx-in" : "fx-bad",
      );
    else if (selectorFoco && t.classList.contains("blk")) t.classList.add("fx-place");
  }
};
/** Clave de la última vista dibujada (para la animación de entrada). */
let ultimaVista = "";
/** Cambia de vista, limpia la retroalimentación, enfoca el título y sube al inicio. */
const irA = (vista) => {
  // Al salir del panel docente se oculta el código del último estudiante registrado
  // (privacidad en equipos compartidos).
  if (vistaActual === "doc" && vista !== "doc") olvidarCodigoMostrado();
  vistaActual = vista;
  retroalimentacion = null;
  render(1);
  scrollTo(0, 0);
};
/* ---------- 12. ACCIONES (acciones) ---------- */
/** Acciones de la interfaz: la clave es el valor de data-a y reciben data-i como argumento. */
const acciones = {
  /** Abre el acceso docente y, si ya hay sesión, carga el panel. */
  doc: async () => {
    mensajeError = "";
    irA("login");
    try {
      const session = await api("/api/sofia/auth/session", { method: "GET" });
      if (session.authenticated) await loadTeacherData();
    } catch (e) {
      teacherLoadError = e.message;
      render();
    }
  },
  /** Inicia sesión docente con usuario y contraseña. */
  lg: async () => {
    const user = (($("#us") && $("#us").value) || "").trim();
    const password = ($("#pw") && $("#pw").value) || "";
    if (!user || !password) {
      mensajeError = "Escribe tu usuario y tu contraseña.";
      announce(mensajeError);
      focoPendiente = user ? "#pw" : "#us";
      render();
      return;
    }
    try {
      const session = await api("/api/sofia/auth/login", {
        method: "POST",
        body: JSON.stringify({ user, password }),
      });
      if (!session.authenticated) throw new Error("No se pudo iniciar sesión.");
      mensajeError = "";
      teacherLoadError = "";
      await loadTeacherData();
    } catch (e) {
      mensajeError = e.message;
      announce(mensajeError);
      focoPendiente = "#pw";
      render();
    }
  },
  /** Registra un estudiante nuevo en la nube y muestra su código. */
  dadd: async () => {
    const nombre = $("#sn").value.trim();
    const grado = $("#sg").value;
    if (!nombre || !["10", "11"].includes(grado)) {
      dialogo("Escribe un nombre y elige un grado válido.", null);
      return;
    }
    try {
      setSync("syncing", "Creando estudiante…");
      const resultado = await api("/api/sofia/teacher/students", {
        method: "POST",
        body: JSON.stringify({ name: nombre, grade: grado }),
      });
      teacherRoster.push(resultado.student);
      estado.teacherCodes[resultado.student.id] = resultado.accessCode;
      persist();
      issuedCode = resultado.accessCode;
      issuedCodeName = resultado.student.name;
      setSync("synced", "Estudiante sincronizado");
      render();
      showIssuedCode(resultado.student.name, resultado.accessCode);
    } catch (e) {
      setSync(navigator.onLine ? "error" : "offline", e.message);
      dialogo("No se pudo registrar: " + escaparHTML(e.message), null);
    }
  },
  /** Quita a un estudiante del grupo (con confirmación). */
  drm: (clave) => {
    const perfil = teacherMap()[clave];
    if (!perfil) return;
    dialogo(
      "¿Quitar a " + escaparHTML(perfil.name) + " del grupo? Esta acción se sincronizará con la nube.",
      async () => {
        try {
          setSync("syncing", "Eliminando estudiante…");
          await api(`/api/sofia/teacher/students/${encodeURIComponent(clave)}`, { method: "DELETE" });
          teacherRoster = teacherRoster.filter((registro) => registro.id !== clave);
          delete estado.teacherCodes[clave];
          olvidarCodigoMostrado();
          persist();
          setSync("synced", "Estudiante eliminado");
          render();
        } catch (e) {
          setSync("error", e.message);
          dialogo("No se pudo eliminar: " + escaparHTML(e.message), null);
        }
      },
    );
  },
  /** Ajusta (o quita el ajuste de) la nota de un periodo terminado. */
  adj: (clave) => {
    const perfil = teacherMap()[clave];
    if (!perfil) return;
    dialogo(
      "¿Qué periodo ajustar (1-4)?",
      (respuesta) => {
        const periodo = +respuesta - 1;
        if (!(periodo >= 0 && periodo < 4)) return;
        if (!perfil.u[periodo] || !perfil.u[periodo].done) {
          dialogo("Ese periodo aún no está terminado.", null);
          return;
        }
        dialogo(
          "Nueva nota 1.0–5.0 (vacío = quitar el ajuste):",
          async (valor) => {
            if (valor === "") delete perfil.u[periodo].ov;
            else {
              const nota = parseFloat(valor.replace(",", "."));
              if (!(nota >= 1 && nota <= 5)) {
                dialogo("Nota no válida.", null);
                return;
              }
              perfil.u[periodo].ov = nota;
            }
            if (await updateTeacherStudent(clave, perfil)) render();
          },
          1,
        );
      },
      1,
    );
  },
  /** Edita el nombre y el grado de un estudiante. */
  tedit: (clave) => {
    const perfil = teacherMap()[clave];
    if (!perfil) return;
    dialogo(
      "Nombre del estudiante:",
      (respuesta) => {
        const nombre = String(respuesta || "").trim();
        if (!nombre || nombre.length > 120) {
          dialogo("El nombre debe tener entre 1 y 120 caracteres.", null);
          return;
        }
        dialogo(
          "Grado actual " + perfil.grade + "°. Escribe 10 u 11:",
          async (grado) => {
            if (!["10", "11"].includes(String(grado))) {
              dialogo("El grado debe ser 10 u 11.", null);
              return;
            }
            perfil.name = nombre;
            perfil.grade = String(grado);
            if (await updateTeacherStudent(clave, perfil)) render();
          },
          "text",
          perfil.grade,
        );
      },
      "text",
      perfil.name,
    );
  },
  /** Descarga el informe grupal con los estudiantes de la nube. */
  rep: () => {
    const perfilesLocales = estado.p;
    estado.p = teacherMap();
    const html = informeGrupal();
    estado.p = perfilesLocales;
    descargar("sophialap-informe-estudiantes.html", html, "text/html");
  },
  // Tablero docente: reporte individual, filtro por grado, orden de la tabla y selección del estudiante
  /** Descarga el reporte individual del estudiante. */
  repstu: (clave) => {
    const perfil = teacherMap()[clave];
    if (!perfil) return;
    descargar("sophialap-reporte-" + fileSlug(perfil.name) + ".html", reporteIndividual(perfil), "text/html");
    announce("Reporte de " + perfil.name + " descargado.");
  },
  /** Filtra el tablero por grado. */
  dfg: (grado) => {
    filtroDocente.g = ["10", "11"].includes(grado) ? grado : "";
    render();
  },
  /** Ordena la tabla por la columna; un segundo clic invierte el orden. */
  dsort: (criterio) => {
    if (ordenDocente.k === criterio) ordenDocente.d *= -1;
    else ordenDocente = { k: criterio, d: criterio === "nota" || criterio === "avance" ? -1 : 1 };
    render();
  },
  /** Abre o cierra el detalle de un estudiante. */
  dsel: (clave) => {
    estudianteSeleccionado = clave || null;
    if (estudianteSeleccionado) focoPendiente = "#det-h";
    else announce("Detalle cerrado.");
    render();
  },
  /** Descarga las notas en CSV para Excel. */
  csv: () => {
    const filas = [["Nombre", "Grado", "P1", "P2", "P3", "P4", "Nota final", "Actividades omitidas"]];
    Object.values(teacherMap()).forEach((perfil) =>
      filas.push([
        perfil.name,
        perfil.grade + "°",
        ...[0, 1, 2, 3].map((i) =>
          perfil.u[i] && perfil.u[i].done ? notaPeriodo(perfil.u[i]).toFixed(1).replace(".", ",") : "",
        ),
        notaFinalTexto(perfil).replace(".", ","),
        omitidas(perfil),
      ]),
    );
    descargar(
      "sophialap-notas.csv",
      "\ufeff" +
        filas
          .map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(";"))
          .join("\r\n"),
      "text/csv",
    );
  },
  /** Borra todos los estudiantes de la nube (doble confirmación). */
  wall: () =>
    dialogo("¿Borrar TODOS los datos de todos los estudiantes? No se puede deshacer.", () =>
      dialogo("Confirma otra vez: se borrará todo.", async () => {
        try {
          for (const registro of [...teacherRoster])
            await api(`/api/sofia/teacher/students/${encodeURIComponent(registro.id)}`, { method: "DELETE" });
          teacherRoster = [];
          estado.teacherCodes = {};
          olvidarCodigoMostrado();
          persist();
          setSync("synced", "Lista vacía sincronizada");
          render();
        } catch (e) {
          setSync("error", e.message);
          dialogo("No se pudo completar el borrado: " + escaparHTML(e.message), null);
        }
      }),
    ),
  /** Marca un recurso como «sin cuenta» (1) o «pide cuenta» (2). */
  ra: (valor) => {
    const [grado, periodo, indiceRecurso, marca] = valor.split(",");
    const entrada = recursosPeriodo(+grado, +periodo)[+indiceRecurso];
    const marcaRecurso = estado.rs[entrada[0][2]] || (estado.rs[entrada[0][2]] = {});
    marcaRecurso.a = +marca;
    persist();
    updateTeacherSettings();
    render();
  },
  /** Oculta o muestra un recurso a los estudiantes. */
  rh: (valor) => {
    const [grado, periodo, indiceRecurso] = valor.split(",");
    const entrada = recursosPeriodo(+grado, +periodo)[+indiceRecurso];
    const marcaRecurso = estado.rs[entrada[0][2]] || (estado.rs[entrada[0][2]] = {});
    marcaRecurso.h = marcaRecurso.h ? 0 : 1;
    persist();
    updateTeacherSettings();
    render();
  },
  /** Quita un recurso agregado por el docente. */
  rd: (valor) => {
    const [grado, periodo, indiceRecurso] = valor.split(",");
    const entrada = recursosPeriodo(+grado, +periodo)[+indiceRecurso];
    if (entrada[1]) {
      estado.ex[grado + "," + periodo].splice(entrada[2], 1);
      persist();
      updateTeacherSettings();
      render();
    }
  },
  /** Agrega un recurso propio a un periodo. */
  radd: () => {
    const grado = $("#rg").value;
    const periodo = $("#rp").value;
    const titulo = $("#rt").value.trim();
    const enlace = $("#ru").value.trim();
    if (!titulo || !/^https?:\/\//.test(enlace)) {
      dialogo("Escribe un título y un enlace que empiece por http:// o https://.", null);
      return;
    }
    (estado.ex[grado + "," + periodo] = estado.ex[grado + "," + periodo] || []).push(["🔗", titulo, enlace]);
    persist();
    updateTeacherSettings();
    focoPendiente = "#rt";
    announce("Recurso agregado.");
    render();
  },
  /** Va a la portada. */
  cover: () => irA("cover"),
  /** Va al inicio. */
  home: () => irA("home"),
  /** Va a la ruta de periodos. */
  map: () => irA("map"),
  /** Va al resultado final. */
  final: () => irA("final"),
  /** Abre un perfil de la nube con su código personal. */
  access: async () => {
    const codigo = ($("#ac") && $("#ac").value.trim()) || "";
    if (!codigo) {
      mensajeError = "Escribe tu código personal.";
      render();
      return;
    }
    accessBusy = true;
    mensajeError = "";
    render();
    setSync("syncing", "Abriendo perfil…");
    try {
      const resultado = await api("/api/sofia/students/access", {
        method: "POST",
        body: JSON.stringify({ accessCode: codigo }),
      });
      const alumno = resultado.student;
      const perfil = {
        ...(alumno.progress || {}),
        name: alumno.name,
        grade: String(alumno.grade),
        u: (alumno.progress && alumno.progress.u) || {},
        cloudId: alumno.id,
        _localKey: "cloud:" + alumno.id,
        accessCode: codigo,
      };
      const clave = profileKey(perfil);
      estado.p[clave] = perfil;
      usuario = perfil;
      persist();
      accessBusy = false;
      issuedCode = codigo;
      issuedCodeName = perfil.name;
      setSync("synced", "Perfil sincronizado");
      irA("map");
    } catch (e) {
      accessBusy = false;
      mensajeError = e.message;
      setSync(navigator.onLine ? "error" : "offline", e.message);
      render();
    }
  },
  /** Muestra el código personal de un perfil local. */
  ["show-code"]: (clave) => {
    const perfil = estado.p[clave];
    if (perfil && perfil.accessCode) showIssuedCode(perfil.name, perfil.accessCode);
  },
  /** Muestra el código emitido por el docente a un estudiante. */
  ["show-teacher-code"]: (clave) => {
    const perfil = teacherMap()[clave];
    const codigo = estado.teacherCodes[clave];
    if (perfil && codigo) showIssuedCode(perfil.name, codigo);
  },
  /** Copia el código personal guardado de un perfil. */
  ["copy-saved"]: async (clave) => {
    const perfil = estado.p[clave];
    if (!perfil || !perfil.accessCode) return;
    try {
      await navigator.clipboard.writeText(perfil.accessCode);
      announce("Código de " + perfil.name + " copiado.");
    } catch (e) {
      dialogo("No se pudo copiar automáticamente. Selecciona el código que aparece en pantalla.", null);
    }
  },
  /** Copia el último código personal emitido. */
  ["copy-code"]: async () => {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      announce("Código personal copiado.");
    } catch (e) {
      dialogo("No se pudo copiar automáticamente. Selecciona el código que aparece en pantalla.", null);
    }
  },
  /** Cierra la sesión docente. */
  logout: async () => {
    try {
      await api("/api/sofia/auth/logout", { method: "POST" });
      teacherReady = false;
      teacherRoster = [];
      teacherSettings = { resources: {}, extraResources: {} };
      olvidarCodigoMostrado();
      setSync("synced", "Sesión docente cerrada");
      irA("home");
    } catch (e) {
      setSync("error", e.message);
      dialogo("No se pudo cerrar la sesión: " + escaparHTML(e.message), null);
    }
  },
  /** Cambia el tamaño del texto (paso −1 o +1). */
  sz: (paso) => {
    estado.u =
      ESCALAS_TEXTO[Math.min(ESCALAS_TEXTO.length - 1, Math.max(0, ESCALAS_TEXTO.indexOf(estado.u) + +paso))];
    save();
    announce("Tamaño del texto: " + Math.round(estado.u * 100) + " %");
    render();
  },
  /** Continúa con un perfil guardado. */
  use: (clave) => {
    usuario = estado.p[clave];
    irA("map");
  },
  /** Crea (o reutiliza) el perfil con el nombre y grado escritos y abre la ruta. */
  start: () => {
    const nombre = nombreFormulario.trim();
    if (!nombre || !["10", "11"].includes(gradoFormulario)) {
      mensajeError = "Escribe tu nombre y elige el grado 10° u 11°.";
      announce(mensajeError);
      focoPendiente = "#nm";
      render();
      return;
    }
    mensajeError = "";
    const normalizado = nombre
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const coincidencias = Object.values(estado.p).filter(
      (perfil) =>
        String(perfil.name || "")
          .toLocaleLowerCase("es")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") === normalizado && String(perfil.grade) === gradoFormulario,
    );
    if (coincidencias.length > 1) {
      mensajeError = "Hay varios perfiles con ese nombre y grado. Abre el perfil con tu código personal.";
      render();
      return;
    }
    const clave = normalizado + "|" + gradoFormulario;
    usuario = coincidencias[0] || { name: nombre, grade: gradoFormulario, u: {} };
    if (!coincidencias.length) estado.p[clave] = usuario;
    save();
    irA("map");
  },
  /** Borra todos los perfiles de este dispositivo (con confirmación). */
  wipe: () =>
    dialogo("¿Borrar todos los perfiles de este dispositivo?", () => {
      estado.p = {};
      olvidarCodigoMostrado();
      save();
      render();
    }),
  /** Abre un periodo de la ruta. */
  open: (indice) => {
    periodoActual = +indice;
    estadoOrdenar = null;
    viendoTeoria = 0;
    irA("unit");
  },
  /** Califica el paso actual y avanza al siguiente. */
  nx: () => {
    const progreso = progresoPeriodo(periodoActual);
    if (progreso.step >= 1 && progreso.step <= 5)
      progreso.sc[progreso.step - 1] = puntajeActividad(progreso.step);
    progreso.step++;
    estadoOrdenar = null;
    retroalimentacion = null;
    save();
    focoPendiente = SELECTOR_TITULO_TARJETA;
    render();
    scrollTo(0, 0);
  },
  /** Muestra la teoría sin salir de la actividad. */
  th: () => {
    viendoTeoria = 1;
    focoPendiente = SELECTOR_TITULO_TARJETA;
    render();
    scrollTo(0, 0);
  },
  /** Vuelve de la teoría a la actividad. */
  bk: () => {
    viendoTeoria = 0;
    focoPendiente = SELECTOR_TITULO_TARJETA;
    render();
    scrollTo(0, 0);
  },
  /** Omite la actividad actual (cuenta 1.0) tras confirmar. */
  om: () => {
    const progreso = progresoPeriodo(periodoActual);
    const pesoPorcentaje = PESOS[progreso.step - 1] * 100;
    dialogo(
      "¿Omitir esta actividad? Vale " + pesoPorcentaje + "% de la nota del periodo y quedará en 1.0.",
      () => {
        progreso.sc[progreso.step - 1] = 1;
        progreso.sk[progreso.step - 1] = 1;
        progreso.step++;
        estadoOrdenar = null;
        retroalimentacion = null;
        save();
        focoPendiente = SELECTOR_TITULO_TARJETA;
        render();
        scrollTo(0, 0);
      },
    );
  },
  /** Coloca un paso en la actividad de ordenar. */
  dp: (indice) => {
    estadoOrdenar.sl.push(+indice);
    estadoOrdenar.pool = estadoOrdenar.pool.filter((x) => x !== +indice);
    retroalimentacion = null;
    focoPendiente = '[data-a=dr][data-i="' + indice + '"]';
    announce(
      "Colocado en la posición " +
        estadoOrdenar.sl.length +
        (estadoOrdenar.pool.length ? "" : ". Ya puedes pulsar Comprobar."),
    );
    render();
  },
  /** Devuelve un paso colocado a la lista. */
  dr: (indice) => {
    estadoOrdenar.sl = estadoOrdenar.sl.filter((x) => x !== +indice);
    estadoOrdenar.pool.push(+indice);
    retroalimentacion = null;
    focoPendiente = '[data-a=dp][data-i="' + indice + '"]';
    announce("Devuelto a la lista.");
    render();
  },
  /** Comprueba el orden: si es correcto avanza; si no, suma error y muestra una pista. */
  dc: () => {
    const datosPeriodo = periodosDelGrado()[periodoActual];
    const grupos = datosPeriodo.g || datosPeriodo.o.map((_, i) => i);
    const primerError = estadoOrdenar.sl.findIndex((x, i) => grupos[x] !== grupos[i]);
    if (primerError < 0) {
      acciones.nx();
      lanzarConfeti();
      return;
    }
    const progreso = progresoPeriodo(periodoActual);
    progreso.e++;
    progreso.h[0]++;
    save();
    const nivelPista = (progreso.h[0] - 1) % 6;
    retroalimentacion = {
      t: "💡 Pista " + (nivelPista + 1) + " de 6 · revisa el paso " + (primerError + 1),
      x: pistasOrden(periodosDelGrado()[periodoActual].o, nivelPista),
      k: "bad",
    };
    focoPendiente = "#fbk";
    announce(retroalimentacion.t + ". " + retroalimentacion.x);
    render();
  },
  /** Responde una pregunta de V/F o del reto. */
  ck: (i) => {
    const paso = progresoPeriodo(periodoActual).step;
    responderPregunta(i, paso == 2 ? "v" : "q", preguntasDelPaso(paso), paso);
  },
  /** Pide una pista de escritura (Dilema o Creación). */
  hx: () => {
    const progreso = progresoPeriodo(periodoActual);
    const pistasUsadas = ++progreso.h[progreso.step - 1];
    retroalimentacion = {
      t: "💡 Pista " + (((pistasUsadas - 1) % 6) + 1) + " de 6",
      x: PISTAS_ESCRITURA[progreso.step - 4][(pistasUsadas - 1) % 6],
      k: "hint",
    };
    save();
    focoPendiente = "#fbk";
    announce(retroalimentacion.t + ". " + retroalimentacion.x);
    render();
  },
  /** Elige la postura del dilema. */
  pos: (indice) => {
    const progreso = progresoPeriodo(periodoActual);
    (progreso.a.d = progreso.a.d || { pos: -1, arg: "", obj: "" }).pos = +indice;
    save();
    render();
  },

  /** Termina el periodo: calcula la nota de pistas y vuelve a la ruta (o al final). */
  fin: () => {
    const progreso = progresoPeriodo(periodoActual);
    progreso.sc[5] = Math.max(1, redondear1(5 - 0.25 * progreso.h.reduce((x, y) => x + y, 0)));
    progreso.done = 1;
    save();
    lanzarConfeti();
    irA(periodosDelGrado().every((_, i) => periodoTerminado(i)) ? "final" : "map");
  },
};
/* ---------- 13. EVENTOS GLOBALES ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  if (b.getAttribute("aria-disabled") === "true") {
    e.preventDefault();
    announce(b.dataset.hint || "Esta opción todavía no está disponible.");
    return;
  }
  if (acciones[b.dataset.a]) acciones[b.dataset.a](b.dataset.i);
});
$(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  const m = $("#main");
  if (m) m.focus();
});
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.key !== "Enter" || t.tagName !== "INPUT" || t.closest("[role=dialog]")) return;
  const a = { us: "lg", pw: "lg", nm: "start", ac: "access", sn: "dadd", rt: "radd", ru: "radd" }[t.id];
  if (a) {
    e.preventDefault();
    acciones[a]();
  }
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "nm") nombreFormulario = t.value;
  if (t.id === "gr") gradoFormulario = t.value;
  if (["ta", "tb", "tc"].includes(t.id)) {
    const p = progresoPeriodo(periodoActual);
    const d = (p.a.d = p.a.d || { pos: -1, arg: "", obj: "" });
    if (t.id === "ta") d.arg = t.value;
    if (t.id === "tb") d.obj = t.value;
    if (t.id === "tc") p.a.c = t.value;
    save();
    const c = $("#cnt-" + t.id);
    if (c) {
      const n = t.value.length;
      const min = +c.dataset.min;
      c.classList.toggle("is-ok", n >= min);
      c.querySelector(".count__n").textContent = n + " / " + min + " caracteres";
      c.querySelector(".count__saved").classList.toggle("on", n > 0);
    }
    const n = $("#nxb");
    if (n) {
      const was = n.getAttribute("aria-disabled") === "true";
      const now = !actividadCompleta();
      n.setAttribute("aria-disabled", String(now));
      if (was && !now) announce("Ya puedes continuar.");
    }
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "gr") gradoFormulario = e.target.value;
});
// Búsqueda del tablero docente: re-renderiza con una pequeña espera y conserva el cursor al final del texto
document.addEventListener("input", (e) => {
  if (e.target.id !== "dsq") return;
  filtroDocente.q = e.target.value;
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => {
    if (vistaActual !== "doc") return;
    render();
    const i = $("#dsq");
    if (i) {
      const n = i.value.length;
      i.focus();
      try {
        i.setSelectionRange(n, n);
      } catch (x) {}
    }
  }, 200);
});

/* ---------- 14. FONDO: CONSTELACIÓN ANIMADA (#net) ---------- */
(() => {
  const lienzo = $("#net");
  const ctx = lienzo.getContext("2d");
  const reducirMovimiento = matchMedia("(prefers-reduced-motion:reduce)");
  const DIST_ENLACE = 150;
  const DORADO = "245,196,81";
  const LILA = "196,181,253";
  let ancho = 0;
  let alto = 0;
  let particulas = [];
  let t0 = 0;
  let idAnimacion = 0;
  let ratonX = -999;
  let ratonY = -999;
  /** Crea una partícula con posición, velocidad, radio y color al azar. */
  const crearParticula = () => ({
    x: Math.random() * ancho,
    y: Math.random() * alto,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: 1 + Math.random() * 1.3,
    g: Math.random() < 0.35,
  });
  /** Ajusta el lienzo a la ventana y la cantidad de partículas al área. */
  const ajustarTamano = () => {
    const escalaPixeles = Math.min(devicePixelRatio || 1, 2);
    ancho = innerWidth;
    alto = innerHeight;
    lienzo.width = ancho * escalaPixeles;
    lienzo.height = alto * escalaPixeles;
    ctx.setTransform(escalaPixeles, 0, 0, escalaPixeles, 0, 0);
    const cantidad = Math.min(110, Math.max(26, Math.round((ancho * alto) / 14000)));
    while (particulas.length < cantidad) particulas.push(crearParticula());
    particulas.length = cantidad;
    particulas.forEach((particula) => {
      if (particula.x > ancho) particula.x = Math.random() * ancho;
      if (particula.y > alto) particula.y = Math.random() * alto;
    });
    dibujar();
  };
  /** Dibuja enlaces entre partículas cercanas, enlaces al puntero y las partículas. */
  const dibujar = () => {
    ctx.clearRect(0, 0, ancho, alto);
    for (let i = 0; i < particulas.length; i++) {
      const a = particulas[i];
      for (let j = i + 1; j < particulas.length; j++) {
        const b = particulas[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distancia = Math.hypot(dx, dy);
        if (distancia < DIST_ENLACE) {
          ctx.strokeStyle = `rgba(${a.g && b.g ? DORADO : LILA},${(1 - distancia / DIST_ENLACE) * 0.3})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const particula of particulas) {
      const dx = particula.x - ratonX;
      const dy = particula.y - ratonY;
      const distancia = Math.hypot(dx, dy);
      if (distancia < DIST_ENLACE + 20) {
        ctx.strokeStyle = `rgba(${DORADO},${(1 - distancia / (DIST_ENLACE + 20)) * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(particula.x, particula.y);
        ctx.lineTo(ratonX, ratonY);
        ctx.stroke();
      }
    }
    for (const particula of particulas) {
      ctx.fillStyle = `rgba(${particula.g ? DORADO : LILA},${particula.g ? 0.85 : 0.7})`;
      ctx.shadowColor = `rgb(${particula.g ? DORADO : LILA})`;
      ctx.shadowBlur = particula.g ? 8 : 5;
      ctx.beginPath();
      ctx.arc(particula.x, particula.y, particula.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };
  /** Mueve las partículas (atraídas por el puntero) y redibuja en cada fotograma. */
  const animar = (ahora) => {
    const factor = Math.min((ahora - t0) / 16.7, 3) || 1;
    t0 = ahora;
    for (const particula of particulas) {
      const dx = ratonX - particula.x;
      const dy = ratonY - particula.y;
      const distancia = Math.hypot(dx, dy);
      if (distancia < 170 && distancia > 1) {
        particula.x += (dx / distancia) * 0.35 * factor;
        particula.y += (dy / distancia) * 0.35 * factor;
      }
      particula.x += particula.vx * factor;
      particula.y += particula.vy * factor;
      if (particula.x < -10) particula.x = ancho + 10;
      else if (particula.x > ancho + 10) particula.x = -10;
      if (particula.y < -10) particula.y = alto + 10;
      else if (particula.y > alto + 10) particula.y = -10;
    }
    dibujar();
    idAnimacion = requestAnimationFrame(animar);
  };
  /** Inicia o detiene la animación según la visibilidad y la preferencia de movimiento. */
  const iniciar = () => {
    cancelAnimationFrame(idAnimacion);
    if (!reducirMovimiento.matches && !document.hidden) {
      t0 = performance.now();
      idAnimacion = requestAnimationFrame(animar);
    }
  };
  addEventListener("pointermove", (e) => {
    ratonX = e.clientX;
    ratonY = e.clientY;
  });
  addEventListener("pointerleave", () => {
    ratonX = ratonY = -999;
  });
  addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") ratonX = ratonY = -999;
  });
  addEventListener("resize", ajustarTamano);
  document.addEventListener("visibilitychange", iniciar);
  reducirMovimiento.addEventListener && reducirMovimiento.addEventListener("change", iniciar);
  ajustarTamano();
  iniciar();
})();
/* ---------- 15. ARRANQUE ---------- */
/** true mientras se refrescan los datos del panel docente (evita solapes). */
let teacherRefreshBusy = false;
setInterval(async () => {
  if (vistaActual !== "doc" || !teacherReady || document.visibilityState !== "visible" || teacherRefreshBusy)
    return;
  teacherRefreshBusy = true;
  try {
    const [roster, settings] = await Promise.all([
      api("/api/sofia/teacher/students", { method: "GET" }),
      api("/api/sofia/teacher/settings", { method: "GET" }),
    ]);
    const next = Array.isArray(roster) ? roster : [];
    const nextSettings = settings.settings || { resources: {}, extraResources: {} };
    const oldById = new Map(teacherRoster.map((s) => [s.id, s]));
    const rosterChanged =
      next.length !== teacherRoster.length || next.some((s) => oldById.get(s.id)?.updatedAt !== s.updatedAt);
    const settingsChanged = JSON.stringify(nextSettings) !== JSON.stringify(teacherSettings);
    teacherRoster = next;
    teacherSettings = nextSettings;
    estado.rs = nextSettings.resources || {};
    estado.ex = nextSettings.extraResources || {};
    if (settingsChanged) persist();
    if (rosterChanged || settingsChanged) {
      setSync("synced", "Datos actualizados");
      if (!document.querySelector("[role=dialog]")) render();
    } else if (syncState === "error" || syncState === "offline") setSync("synced", "Conectado");
  } catch (e) {
    if (e.message.includes("Acceso docente requerido")) {
      teacherReady = false;
      teacherLoadError = "La sesión docente venció. Inicia sesión de nuevo.";
      vistaActual = "login";
      render();
    } else setSync(navigator.onLine ? "error" : "offline", e.message);
  } finally {
    teacherRefreshBusy = false;
  }
}, 20000);
if (!ESCALAS_TEXTO.includes(estado.u)) estado.u = 1;
render();
// Arranque: comprueba si existe el servidor de sincronización; si no, la app trabaja solo en local.
api("/api/sofia/auth/session", { method: "GET" })
  .catch(() => {})
  .finally(() => {
    if (LOCAL_ONLY) {
      setSync("local", "");
      if (vistaActual === "home" || vistaActual === "login") render();
    } else migrateLocalProfiles();
  });
