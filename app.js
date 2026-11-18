/* ==========================================================
   SOPHIALAP · Filosofía e informática global (SPA en JS vanilla)
   OVA «Lógica: del silogismo al algoritmo» · una lección de ~45 minutos
   Fundamentos de Algoritmia · Universidad de Córdoba · 2026
   Índice (en el orden en que aparece en el archivo):
   1.  Estado, almacenamiento local y sincronización (estado, progressOf, save)
   1b. Conexión con Supabase (rpc, api) · no modificar
   2.  Utilidades (escaparHTML, barajar, anuncios, cabecera, pie, countUp, confeti)
   3.  Datos de la lección (LECCION, PASOS_LECCION, TEORIA, RONDAS_ORDENAR, ACTIVIDADES, RECURSOS_LECCION)
   4.  Progreso y calificación (leccionDe, progresoLeccion, PESOS, puntajeActividad, notaLeccion, nivel)
   5.  Teoría y recursos (vistaTeoria, vistaRecursosDocente)
   6.  Informes HTML: CSS común, informe grupal (informeGrupal) y reporte individual (reporteIndividual)
   7.  Diálogos y pistas (dialogo, pistaOrdenar)
   8.  Actividades con preguntas: A2, A3 y evaluación (preguntasDelPaso, responderPregunta, vistaPreguntas)
   9.  Panel docente: datos de la nube (teacherMap, loadTeacherData)
   9b. Panel docente: estadísticas, gráficos y detalle del estudiante
   10. Vistas (objeto `vistas`): cover, login, home, leccion, unit, final, doc
   11. Render (`render`) y navegación (`irA`)
   12. Acciones (objeto `acciones`, despachadas por data-a / data-i)
   13. Eventos globales (clic, teclado, escritura)
   14. Fondo: constelación animada (#net)
   15. Arranque

   Formato del progreso que se guarda en la nube: { name, grade, u: { "0": lección } }.
   La lección vive en u["0"] (ver progresoVacio en la sección 4 para cada campo).
   ========================================================== */

/* ---------- 1. ESTADO, ALMACENAMIENTO Y SINCRONIZACIÓN ---------- */
/** Escalas de tamaño de texto disponibles (A− / A+), aplicadas como variable CSS --u. */
const ESCALAS_TEXTO = [0.9, 1, 1.1, 1.25];
/** Clave de localStorage donde se guarda todo el estado de la app (nueva: el progreso de 8 periodos no es compatible). */
const CLAVE_ALMACEN = "sophialap-logica-1";
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
/** Ruta del logotipo oficial de la Universidad de Córdoba (pie y créditos). */
const LOGO_UNIVERSIDAD = "assets/logo-unicordoba.png";
/** Vista desde la que se abrieron los créditos (para el botón «Volver»). */
let vistaPrevia = "cover";
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
  capa.className = "capa-dialogo capa-dialogo--codigo";
  capa.innerHTML =
    `<section class=card>` +
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
/** Contador de caracteres de un campo de escritura (reflexión del cierre). */
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
    2: "Clasifica los cinco razonamientos para continuar.",
    3: "Elige la estructura de los cinco casos para continuar.",
    4: "Responde las cinco preguntas de la evaluación para continuar.",
  }[progresoLeccion().step] || "Completa la actividad para continuar.") +
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
    `</div><div class=tools role=group aria-label="Tamaño del texto, créditos y acceso docente">` +
    (`<button data-a=sz data-i=-1 aria-label="Texto más pequeño" ` +
      (indiceEscala < 1 ? 'aria-disabled=true data-hint="El texto ya está en el tamaño mínimo."' : "") +
      `>A−</button>`) +
    (`<span>${Math.round(estado.u * 100)}%</span>` +
      `<button data-a=sz data-i=1 aria-label="Texto más grande" ` +
      (indiceEscala >= ESCALAS_TEXTO.length - 1
        ? 'aria-disabled=true data-hint="El texto ya está en el tamaño máximo."'
        : "") +
      `>A+</button>`) +
    `<button data-a=creditos>Créditos</button><button data-a=doc>🔐 Docente</button><span id=sync-status class=sync-line data-state="${syncState}" role=status aria-live=polite aria-label="Estado de sincronización: ${escaparHTML(syncMessage)}">` +
    `<i class=sync-dot aria-hidden=true></i><span>${escaparHTML(syncMessage)}</span>` +
    `</span></div></header>`
  );
};
/** Pie de página visible en todas las vistas: logo de la Universidad de Córdoba, asignatura, programa, año y enlace a Créditos. */
const pie = () =>
  `<footer class=pie><a class=pie__logo href="https://www.unicordoba.edu.co" target=_blank rel=noopener>` +
  `<img src="${LOGO_UNIVERSIDAD}" width=640 height=191 alt="Universidad de Córdoba"><span class=sr> (se abre en una pestaña nueva)</span></a>` +
  `<span class=pie__sep aria-hidden=true></span><p class=pie__texto>Fundamentos de Algoritmia · Licenciatura en Informática y Medios Audiovisuales, Universidad de Córdoba · © 2026` +
  ` · <button class=pie__enlace data-a=creditos>Créditos</button></p></footer>`;
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
/* ---------- 3. DATOS DE LA LECCIÓN ---------- */
/** Marca de versión del progreso de la lección. Un u["0"] sin esta marca (p. ej., de la antigua ruta de periodos) se ignora. */
const VERSION_LECCION = "logica-1";
/** Datos generales: título (t), pregunta guía (q), objetivo (obj), duración (dur) y competencia (comp). */
const LECCION = {
  t: "Lógica: del silogismo al algoritmo",
  q: "¿Cómo puede una máquina «razonar» siguiendo reglas?",
  obj:
    "Al finalizar, identificarás la estructura de un argumento deductivo (premisas y conclusión), " +
    "distinguirás entre un razonamiento válido y uno con premisas verdaderas, y traducirás un razonamiento " +
    "a un algoritmo sencillo con secuencia y condiciones si/entonces.",
  dur: "45 minutos",
  comp: "Crítica, con apoyo de la creativa en el cierre",
};
/** Pasos de la lección (índice = progreso.step): nombre largo (n), nombre en la fila de pasos (p), nombre corto (c) y minutos (m). */
const PASOS_LECCION = [
  { n: "Objetivo y teoría", p: "Objetivo y teoría", c: "Teoría", m: 10 },
  { n: "Actividad 1 · Arma el silogismo", p: "Arma el silogismo", c: "A1", m: 7 },
  { n: "Actividad 2 · ¿Válido o inválido?", p: "¿Válido?", c: "A2", m: 8 },
  { n: "Actividad 3 · Del silogismo al algoritmo", p: "Al algoritmo", c: "A3", m: 8 },
  { n: "Evaluación final", p: "Evaluación", c: "Evaluación", m: 7 },
  { n: "Cierre", p: "Cierre", c: "Cierre", m: 5 },
];
/** Último paso de la lección (el cierre). */
const PASO_CIERRE = PASOS_LECCION.length - 1;
/** HTML de un argumento: premisas en líneas y la conclusión bajo una raya, como se escribe en lógica. */
const argumento = (premisas, conclusion) =>
  `<span class=argu>` +
  premisas.map((premisa) => `<span class=argu__p>${premisa}</span>`).join("") +
  `<span class=argu__c>${conclusion}</span></span>`;
/** HTML de un bloque de pseudocódigo (el texto ya viene sin etiquetas). */
const pseudocodigo = (lineas) => `<pre class=pseudo><code>${escaparHTML(lineas.join("\n"))}</code></pre>`;
/** Los tres bloques de la teoría: título (t), párrafos HTML (p) y ejemplo HTML (ej). */
const TEORIA = [
  {
    t: "a) El argumento",
    p: [
      "Un <strong>argumento</strong> es un conjunto de afirmaciones en el que unas, las <strong>premisas</strong>, dan razones para aceptar otra, la <strong>conclusión</strong>. Argumentar no es pelear: es ofrecer razones. Palabras como «porque» o «ya que» suelen anunciar premisas; «por lo tanto», «entonces» o «en consecuencia» anuncian la conclusión.",
      "En un argumento <strong>deductivo</strong> la conclusión se sigue necesariamente de las premisas: si aceptas que las premisas son verdaderas, no puedes rechazar la conclusión sin contradecirte.",
    ],
    ej:
      "<strong>Ejemplo.</strong> " +
      argumento(
        ["Siempre que hay examen, la profe revisa los cuadernos. <em>(premisa)</em>", "Mañana hay examen. <em>(premisa)</em>"],
        "Por lo tanto, mañana la profe revisará los cuadernos. <em>(conclusión)</em>",
      ),
  },
  {
    t: "b) El silogismo (Aristóteles)",
    p: [
      "Aristóteles (siglo IV a. C.) estudió una forma especial de argumento deductivo: el <strong>silogismo</strong>. Tiene dos premisas y una conclusión: la <strong>premisa mayor</strong> (una regla general), la <strong>premisa menor</strong> (un caso particular) y la <strong>conclusión</strong>, que une el caso con la regla.",
      "<strong>Validez ≠ verdad.</strong> Un argumento es <em>válido</em> cuando su forma garantiza que, <em>si</em> las premisas fueran verdaderas, la conclusión también lo sería. La <em>verdad</em>, en cambio, dice si cada afirmación coincide con la realidad. Por eso un silogismo puede ser válido con una premisa falsa: «Todos los gatos vuelan / Michi es un gato / Michi vuela» tiene una forma impecable, pero su primera premisa es falsa. Cuando un argumento es válido <em>y</em> sus premisas son verdaderas, decimos que es <strong>sólido</strong>.",
      "Cuidado con las <strong>falacias</strong>: razonamientos que parecen correctos y no lo son. Una muy común es <strong>afirmar el consecuente</strong>: «Si llueve, la calle se moja / La calle está mojada / Entonces llovió». Es inválido: la calle pudo mojarse porque alguien la lavó. De «si P entonces Q» y «Q» no se sigue «P».",
    ],
    ej:
      "<strong>Ejemplo clásico.</strong> " +
      argumento(
        ["Todos los humanos son mortales. <em>(premisa mayor)</em>", "Sócrates es humano. <em>(premisa menor)</em>"],
        "Sócrates es mortal. <em>(conclusión)</em>",
      ),
  },
  {
    t: "c) Del silogismo al algoritmo",
    p: [
      "La regla «si P entonces Q» es una <strong>condición</strong>: cuando se cumple P, se hace Q. Un <strong>algoritmo</strong> es una secuencia finita y ordenada de pasos para resolver un problema, y combina tres estructuras: <strong>secuencia</strong> (un paso tras otro), <strong>condición</strong> (si… entonces… si no…) y <strong>repetición</strong> (mientras…).",
      "<strong>Una idea con historia.</strong> Aristóteles ordenó las reglas del razonamiento; Leibniz (siglo XVII) soñó con resolver las discusiones «calculando»; George Boole (1854) convirtió la lógica en un álgebra de verdadero y falso; y Alan Turing (1936) describió una máquina que, siguiendo reglas simples, puede hacer cualquier cálculo que se pueda describir con precisión.",
    ],
    ej:
      "<strong>El silogismo de Sócrates como algoritmo.</strong>" +
      pseudocodigo([
        "Inicio",
        "  Leer animal",
        "  Si animal es humano entonces",
        "    Mostrar \"es mortal\"",
        "  Si no",
        "    Mostrar \"no se puede concluir\"",
        "Fin",
      ]) +
      "La premisa mayor se volvió la regla <em>si/entonces</em>, la premisa menor es el dato que se lee y la conclusión es lo que se muestra. En la rama «si no» el algoritmo no concluye nada: decir «no es mortal» sería otra falacia (negar el antecedente).",
  },
];
/** Idea que resume la teoría (se muestra como cita al final). */
const IDEA_TEORIA =
  "Razonar bien y programar bien se parecen: en ambos casos se siguen reglas claras, paso a paso, sin saltos.";
/** Tres ideas clave del cierre. */
const IDEAS_CLAVE = [
  "Un argumento tiene premisas (las razones) y una conclusión que se apoya en ellas.",
  "Válido no es lo mismo que verdadero: la validez depende de la forma; la verdad, de los hechos. Un argumento válido con premisas verdaderas es sólido.",
  "Una regla «si P entonces Q» es una condición: con secuencias, condiciones y repeticiones, un razonamiento se vuelve un algoritmo que una máquina puede seguir.",
];
/**
 * Actividad 1 · Arma el silogismo: rondas de ordenar.
 * n nombre, i instrucción, o bloques en orden correcto, g grupo de cada bloque
 * (bloques del mismo grupo pueden ir en cualquier orden entre sí), p seis pistas graduales.
 */
const RONDAS_ORDENAR = [
  {
    n: "Ronda 1 de 2 · Un silogismo clásico",
    i: "Ordena el argumento: primero las dos premisas (en cualquier orden) y al final la conclusión.",
    o: ["Todos los mamíferos respiran con pulmones.", "Las ballenas son mamíferos.", "Las ballenas respiran con pulmones."],
    g: [0, 0, 1],
    p: [
      "Busca la conclusión: es la afirmación que se apoya en las otras dos y va al final.",
      "La premisa mayor es la regla general (habla de «todos»); la premisa menor presenta un caso particular.",
      "La conclusión une el caso particular (las ballenas) con lo que dice la regla general (respirar con pulmones).",
      "Las dos premisas pueden ir en cualquier orden entre ellas: lo importante es que la conclusión quede de última.",
      "Pregúntate: ¿qué afirmación aceptarías solo después de aceptar las otras dos?",
      "Pista final: la conclusión es «Las ballenas respiran con pulmones.»",
    ],
  },
  {
    n: "Ronda 2 de 2 · Un razonamiento en cadena",
    i: "Este argumento tiene tres premisas y dos conclusiones: la primera conclusión sirve de premisa para la segunda. Coloca las premisas (en cualquier orden), luego la conclusión intermedia y al final la conclusión final.",
    o: [
      "Todo algoritmo termina después de un número finito de pasos.",
      "Toda receta de cocina bien escrita es un algoritmo.",
      "La receta de arepas de mi abuela está bien escrita.",
      "La receta de arepas de mi abuela es un algoritmo.",
      "La receta de arepas de mi abuela termina después de un número finito de pasos.",
    ],
    g: [0, 0, 0, 1, 2],
    p: [
      "Primero van las tres premisas; después, las dos conclusiones.",
      "Las premisas son reglas o datos que se aceptan de entrada; las conclusiones se obtienen de ellas.",
      "Con «toda receta bien escrita es un algoritmo» y «la receta de arepas está bien escrita» se concluye algo sobre la receta de arepas.",
      "La conclusión final usa la conclusión intermedia junto con la regla sobre los algoritmos.",
      "Las tres premisas pueden ir en cualquier orden entre ellas; las dos conclusiones, no.",
      "Pista final: primero «…es un algoritmo» y al final «…termina después de un número finito de pasos».",
    ],
  },
];
/**
 * Actividades con preguntas, por paso (2, 3 y 4). Cada una: clave de respuestas (k), título (t),
 * instrucción (i), opciones comunes (o, si las hay) e ítems {p texto HTML, o opciones propias,
 * c índice correcto, e explicación, pi pista, tema (solo evaluación)}.
 */
const ACTIVIDADES = {
  2: {
    k: "v",
    t: "Actividad 2 · ¿Válido o inválido?",
    i: "Decide si cada razonamiento es válido (la conclusión se sigue necesariamente de las premisas) o inválido. Ojo: no te preguntes si es verdad, sino si se sigue. Un error trae una pista.",
    o: ["Válido", "Inválido"],
    it: [
      {
        p: argumento(["Todos los mamíferos tienen pulmones.", "Los perros son mamíferos."], "Por lo tanto, los perros tienen pulmones."),
        c: 0,
        e: "Válido. Tiene la misma forma del silogismo de Sócrates y, además, sus premisas son verdaderas: es un argumento sólido.",
        pi: "Compáralo con «Todos los humanos son mortales / Sócrates es humano / Sócrates es mortal»: ¿tiene la misma forma?",
      },
      {
        p: argumento(["Si estudio, apruebo el examen.", "Aprobé el examen."], "Por lo tanto, estudié."),
        c: 1,
        e: "Inválido: afirma el consecuente. Pudiste aprobar por otra razón (el examen era fácil o ya sabías el tema). De «si P entonces Q» y «Q» no se sigue «P».",
        pi: "Recuerda el ejemplo de la lluvia y la calle mojada: ¿hay otra forma de que se cumpla la segunda parte de la regla?",
      },
      {
        p: argumento(["Todos los peces pueden volar.", "Nemo es un pez."], "Por lo tanto, Nemo puede volar."),
        c: 0,
        e: "Válido, aunque la primera premisa es falsa. La forma es correcta: si fuera cierto que todos los peces vuelan, Nemo volaría. La validez depende de la forma; la verdad, de los hechos.",
        pi: "No te preguntes si es verdad que los peces vuelan. Pregúntate: si las premisas fueran verdaderas, ¿la conclusión tendría que serlo?",
      },
      {
        p: argumento(["Los tres gatos que he tenido odiaban el agua."], "Por lo tanto, todos los gatos odian el agua."),
        c: 1,
        e: "Inválido: es una generalización apresurada. Tres casos no garantizan una conclusión sobre todos los gatos; podría existir un gato al que le guste el agua.",
        pi: "¿Tres casos alcanzan para hablar de «todos»?",
      },
      {
        p: argumento(
          ["Si el semáforo está en rojo, los carros deben detenerse.", "El semáforo está en rojo."],
          "Por lo tanto, los carros deben detenerse.",
        ),
        c: 0,
        e: "Válido: es un modus ponens. De «si P entonces Q» y «P» se sigue «Q». Es justo la regla que ejecuta un algoritmo con una condición.",
        pi: "Aquí se afirma la primera parte de la regla (el «si…»). ¿Qué se sigue entonces?",
      },
    ],
  },
  3: {
    k: "q",
    t: "Actividad 3 · Del silogismo al algoritmo",
    i: "Para cada fragmento o situación, elige la estructura del algoritmo que usa. Un error trae una pista.",
    o: ["Secuencia", "Condición (si… entonces)", "Repetición (mientras…)"],
    it: [
      {
        p: "Preparar un tinto:" + pseudocodigo(["Inicio", "  Hervir el agua", "  Agregar el café", "  Servir en la taza", "Fin"]),
        c: 0,
        e: "Secuencia: los pasos se ejecutan uno tras otro, siempre en el mismo orden y sin decisiones.",
        pi: "¿Hay alguna pregunta o decisión en estos pasos, o solo se hacen uno tras otro?",
      },
      {
        p:
          "Salir de casa:" +
          pseudocodigo(["Leer clima", "Si clima es \"lluvia\" entonces", "  Llevar paraguas", "Si no", "  Salir sin paraguas"]),
        c: 1,
        e: "Condición: el algoritmo elige un camino u otro según si se cumple «clima es lluvia».",
        pi: "Busca la palabra «Si»: ¿el algoritmo toma una decisión?",
      },
      {
        p: "Después del almuerzo:" + pseudocodigo(["Mientras queden platos sucios", "  Lavar un plato", "  Ponerlo a secar"]),
        c: 2,
        e: "Repetición: los mismos pasos se repiten mientras la condición siga siendo verdadera; cuando no quedan platos, el ciclo termina.",
        pi: "¿Los pasos se hacen una sola vez o varias veces?",
      },
      {
        p: "Un programa traduce el silogismo «Todos los humanos son mortales»: lee un dato y, solo si el dato es «humano», muestra «es mortal»; si no, muestra «no se puede concluir».",
        c: 1,
        e: "Condición: la premisa mayor se convirtió en la regla si/entonces y el dato leído hace de premisa menor.",
        pi: "Recuerda el pseudocódigo de la teoría: ¿qué estructura usa para decidir?",
      },
      {
        p: "Una aplicación pide la contraseña una y otra vez mientras la contraseña escrita sea incorrecta.",
        c: 2,
        e: "Repetición: el paso «pedir la contraseña» se repite mientras se cumpla la condición «es incorrecta».",
        pi: "Las expresiones «una y otra vez» y «mientras» son una buena señal.",
      },
    ],
  },
  4: {
    k: "x",
    t: "Evaluación final",
    i: "Cinco preguntas para comprobar el objetivo de la lección. Elige la mejor respuesta; si te equivocas recibes una pista y otra oportunidad.",
    it: [
      {
        tema: "Estructura del argumento",
        p: "En el argumento «Todo lo que está vivo necesita energía. Las plantas están vivas. Por lo tanto, las plantas necesitan energía», ¿cuál es la conclusión?",
        o: [
          "Todo lo que está vivo necesita energía.",
          "Las plantas están vivas.",
          "Las plantas necesitan energía.",
          "El argumento no tiene conclusión.",
        ],
        c: 2,
        e: "La conclusión es la afirmación que se apoya en las demás; aquí la anuncia «por lo tanto».",
        pi: "Busca la expresión que anuncia la conclusión.",
      },
      {
        tema: "Validez y verdad",
        p: "Un argumento es válido cuando…",
        o: [
          "todas sus premisas son verdaderas.",
          "si sus premisas fueran verdaderas, la conclusión tendría que ser verdadera.",
          "la mayoría de las personas está de acuerdo con la conclusión.",
          "su conclusión es verdadera.",
        ],
        c: 1,
        e: "La validez depende de la forma: garantiza que de premisas verdaderas no salga una conclusión falsa. Por eso un argumento válido puede tener premisas falsas.",
        pi: "Recuerda a Michi, el gato que vuela: ¿el silogismo era válido aunque su premisa fuera falsa?",
      },
      {
        tema: "Falacias (afirmar el consecuente)",
        p: "«Si un número termina en 0, es par. El 14 es par. Por lo tanto, el 14 termina en 0.» ¿Qué ocurre con este razonamiento?",
        o: [
          "Es válido: la conclusión se sigue de las premisas.",
          "Es inválido: afirma el consecuente.",
          "Es inválido: generaliza a partir de pocos casos.",
        ],
        c: 1,
        e: "Afirma el consecuente: ser par no implica terminar en 0 (el 14 es par y termina en 4). De «si P entonces Q» y «Q» no se sigue «P».",
        pi: "Compáralo con «Si llueve, la calle se moja / La calle está mojada / Entonces llovió».",
      },
      {
        tema: "Traducir a si/entonces",
        p: "¿Qué regla traduce mejor la premisa «Todo estudiante con nota mayor o igual a 3.0 aprueba»?",
        o: [
          "Si nota ≥ 3.0 entonces Mostrar \"aprueba\"",
          "Mientras nota ≥ 3.0, repetir Mostrar \"aprueba\"",
          "Leer nota y luego Mostrar \"aprueba\", sin revisar nada",
        ],
        c: 0,
        e: "La regla general se convierte en una condición si/entonces. El «mientras» repetiría el mensaje sin fin y la secuencia sin condición le diría «aprueba» a todos.",
        pi: "La regla depende de una condición que se revisa una sola vez.",
      },
      {
        tema: "Qué es un algoritmo",
        p: "¿Qué es un algoritmo?",
        o: [
          "Una secuencia finita y ordenada de pasos para resolver un problema.",
          "Cualquier aparato electrónico que funcione con energía.",
          "Una opinión sobre cómo deberían funcionar las máquinas.",
          "Una lista de datos sin ningún orden.",
        ],
        c: 0,
        e: "Un algoritmo es una secuencia finita y ordenada de pasos; puede seguirlo una persona o una máquina.",
        pi: "Piensa en el pseudocódigo de la teoría: Inicio, pasos en orden… Fin.",
      },
    ],
  },
};
/** Recursos «Para profundizar» de la lección: [icono, título, enlace]. */
const RECURSOS_LECCION = [
  ["📄", "Wikipedia · Silogismo: estructura, figuras y ejemplos", "https://es.wikipedia.org/wiki/Silogismo"],
  [
    "🎬",
    "TeoCom · ¿Qué son las falacias? Explicación fácil con ejemplos",
    "https://www.youtube.com/watch?v=44XeNCfHpLw",
  ],
  ["💻", "Khan Academy · Algoritmos (ciencias de la computación)", "https://es.khanacademy.org/computing/computer-science/algorithms"],
];
/** Clave de los recursos agregados por el docente en estado.ex (y en la nube). */
const CLAVE_RECURSOS_EXTRA = "leccion";
/** Mínimo sugerido de caracteres de la reflexión del cierre (es opcional y no se califica). */
const MINIMO_REFLEXION = 60;

/* ---------- 4. PROGRESO Y CALIFICACIÓN ---------- */
/** Niveles de desempeño, de mayor a menor. */
const NIVELES = ["Superior", "Alto", "Básico", "Bajo"];
/** Complemento de la descripción de cada nivel (mismo orden que NIVELES). */
const SUFIJOS_NIVEL = [
  "de forma autónoma y precisa",
  "con pocas ayudas",
  "con apoyo del docente",
  "solo de manera parcial: necesita repasar la lección",
];
/** Descripción del desempeño para una nota (según su nivel). */
const descripcionNivel = (nota) =>
  "Identifica premisas y conclusión, distingue la validez de la verdad y traduce razonamientos a reglas si/entonces " +
  SUFIJOS_NIVEL[NIVELES.indexOf(nivel(nota))] +
  ".";
/** Peso de cada actividad en la nota final (A1, A2, A3, Evaluación). */
const PESOS = [0.2, 0.25, 0.25, 0.3];
/** Nombres de las cuatro actividades calificadas (mismo orden que PESOS). */
const NOMBRES_ACTIVIDADES = ["Arma el silogismo", "¿Válido o inválido?", "Del silogismo al algoritmo", "Evaluación final"];
/** Nombres cortos de las actividades calificadas, para tablas y gráficos. */
const ACTIVIDADES_CORTAS = ["A1", "A2", "A3", "Eval."];
/** Vista activa (clave de `vistas`). */
let vistaActual = "cover";
/** Perfil del estudiante activo. */
let usuario = null;
/** Valor del campo de nombre en el inicio. */
let nombreFormulario = "";
/** Valor del selector de grado en el inicio. */
let gradoFormulario = "";
/** Mensaje de error que se muestra en el formulario actual. */
let mensajeError = "";
/** Estado en memoria de la ronda de ordenar: pool (bloques disponibles) y sl (bloques colocados). */
let estadoOrdenar = null;
/** Retroalimentación o pista visible: {t: título, x: texto, k: tipo (bad, hint u ok)}. */
let retroalimentacion = null;
/** 1 mientras el estudiante repasa la teoría desde una actividad. */
let viendoTeoria = 0;
/**
 * Progreso vacío de la lección (lo que se guarda en u["0"]):
 * ver versión · step paso actual (0 teoría … 5 cierre) · done 1 si terminó · ini/fin fechas ISO ·
 * sc notas de A1, A2, A3 y evaluación (null = sin calificar) · sk 1 si se omitió · h pistas y e errores por actividad ·
 * a respuestas: o rondas superadas de A1, op comprobaciones fallidas por ronda, v/q/x estado por ítem de A2/A3/evaluación
 * (1 acierto, 2 fallado tras dos intentos), vt/qt/xt intentos errados por ítem, vw/qw/xw opciones erradas elegidas, r reflexión ·
 * ov nota ajustada por el docente (opcional).
 */
const progresoVacio = () => ({
  ver: VERSION_LECCION,
  step: 0,
  done: 0,
  ini: new Date().toISOString(),
  sc: [null, null, null, null],
  sk: [0, 0, 0, 0],
  h: [0, 0, 0, 0],
  e: [0, 0, 0, 0],
  a: {},
});
/** Progreso de la lección de un perfil (null si no la ha empezado o si el dato es de otro formato). */
const leccionDe = (perfil) => {
  const leccion = perfil && perfil.u && perfil.u[0];
  return leccion && leccion.ver === VERSION_LECCION ? leccion : null;
};
/** Progreso de la lección del usuario activo (lo crea vacío si no existe). */
const progresoLeccion = () => leccionDe(usuario) || (usuario.u[0] = progresoVacio());
/** Estado de la lección de un perfil: "sin" (sin empezar), "curso" (en curso) o "fin" (terminada). */
const estadoLeccion = (perfil) => {
  const leccion = leccionDe(perfil);
  return !leccion ? "sin" : leccion.done ? "fin" : "curso";
};
/** Texto corto del avance de un perfil: «Terminada», «Paso n de 6 · nombre» o «Sin empezar». */
const textoAvance = (perfil) => {
  const leccion = leccionDe(perfil);
  if (!leccion) return "Sin empezar";
  if (leccion.done) return "Terminada";
  const paso = Math.min(PASO_CIERRE, +leccion.step || 0);
  return `Paso ${paso + 1} de ${PASOS_LECCION.length} · ${PASOS_LECCION[paso].c}`;
};
/** Avance de la lección de 0 a 1 (terminada = 1; en curso, por pasos alcanzados). */
const avanceLeccion = (perfil) => {
  const leccion = leccionDe(perfil);
  return !leccion ? 0 : leccion.done ? 1 : Math.min(PASO_CIERRE, +leccion.step || 0) / PASOS_LECCION.length;
};
/** Indica si la actividad con preguntas del paso actual está completa para poder continuar. */
const actividadCompleta = () => {
  const progreso = progresoLeccion();
  const actividad = ACTIVIDADES[progreso.step];
  if (!actividad) return true;
  return (progreso.a[actividad.k] || []).filter((x) => x != null).length == actividad.it.length;
};
/** Redondea a un decimal. */
const redondear1 = (valor) => Math.round(valor * 10) / 10;
/** Nivel de desempeño que corresponde a una nota de 1.0 a 5.0. */
const nivel = (nota) => (nota >= 4.6 ? "Superior" : nota >= 4 ? "Alto" : nota >= 3 ? "Básico" : "Bajo");
/**
 * Nota de la actividad k (0 A1, 1 A2, 2 A3, 3 evaluación): 5.0 − 0.5 por pista − 1.0 por ítem fallado
 * (dos intentos erróneos), con mínimo 1.0. En A1 cada comprobación fallida da una pista.
 */
const puntajeActividad = (progreso, k) => {
  const pistas = (progreso.h || [])[k] || 0;
  const actividad = ACTIVIDADES[k + 1];
  const fallados = actividad ? (progreso.a[actividad.k] || []).filter((x) => x === 2).length : 0;
  return Math.max(1, redondear1(5 - 0.5 * pistas - fallados));
};
/** Nota calculada de la lección (sin ajuste docente): promedio ponderado; lo no calificado u omitido cuenta 1.0. */
const notaCalculada = (progreso) =>
  redondear1(PESOS.reduce((total, peso, k) => total + peso * ((progreso.sc || [])[k] || 1), 0));
/** Nota de la lección: la ajustada por el docente (ov) o la calculada. */
const notaLeccion = (progreso) => (typeof progreso.ov === "number" ? progreso.ov : notaCalculada(progreso));
/** Nota final del perfil (null si aún no termina la lección). */
const notaFinal = (perfil) => {
  const leccion = leccionDe(perfil);
  return leccion && leccion.done ? notaLeccion(leccion) : null;
};
/** Nota final con un decimal, o «–» si no hay. */
const notaFinalTexto = (perfil) => (notaFinal(perfil) == null ? "–" : notaFinal(perfil).toFixed(1));

/* ---------- 5. TEORÍA Y RECURSOS ---------- */
/** Recursos de la lección: [recurso, esExtra (0/1), índice] con los propios y los agregados por el docente. */
const recursosLeccion = () =>
  RECURSOS_LECCION.map((recurso, j) => [recurso, 0, j]).concat(
    (estado.ex[CLAVE_RECURSOS_EXTRA] || []).map((recurso, j) => [recurso, 1, j]),
  );
/** Tarjeta con el objetivo de aprendizaje, la pregunta guía y la duración. */
const tarjetaObjetivo = () =>
  `<section class="card objetivo" aria-labelledby=obj-h><p class=ey>Objetivo de aprendizaje</p>` +
  `<h2 id=obj-h>${LECCION.q}</h2><p>${LECCION.obj}</p>` +
  `<p class=mut>Duración estimada: ${LECCION.dur} · Competencia: ${LECCION.comp}.</p></section>`;
/** HTML de la teoría (objetivo, tres bloques con ejemplo, idea clave) y los recursos visibles. */
const vistaTeoria = () => {
  const recursos = recursosLeccion().filter((x) => !(estado.rs[x[0][2]] || {}).h);
  return (
    tarjetaObjetivo() +
    TEORIA.map(
      (bloque) =>
        `<div class=card><h2>${bloque.t}</h2>` +
        bloque.p.map((parrafo) => `<p>${parrafo}</p>`).join("") +
        `<div class=tip>${bloque.ej}</div></div>`,
    ).join("") +
    `<p class=quote><strong>Idea clave</strong>${IDEA_TEORIA}</p>` +
    (`<div class=card><h2>Para profundizar</h2>` +
      (recursos.length
        ? `<div class=recs>` +
          recursos
            .map((x) => {
              const recurso = x[0];
              const marca = estado.rs[recurso[2]] || {};
              return (
                `<a class=rec href="${escaparHTML(recurso[2])}" target=_blank rel=noopener>` +
                `<span aria-hidden=true>${recurso[0]}</span>` +
                `<b>${escaparHTML(recurso[1])}` +
                (marca.a == 1 ? " <small>· ✅ sin cuenta</small>" : marca.a == 2 ? " <small>· 🔒 pide cuenta</small>" : "") +
                `</b><em>Abrir ↗<span class=sr> (se abre en una pestaña nueva)</span></em></a>`
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
/** Sección del panel docente para marcar, ocultar, quitar y agregar recursos de la lección. */
const vistaRecursosDocente = () => {
  const recursos = recursosLeccion();
  return (
    `<section class=card><h2>Recursos de la lección</h2>` +
    `<p class=mut>Marca si cada enlace abre sin cuenta, oculta los que no sirvan o agrega los tuyos. El estudiante los ve en «Para profundizar».</p>` +
    (recursos
      .map(([recurso, esExtra], j) => {
        const marca = estado.rs[recurso[2]] || {};
        const titulo = escaparHTML(recurso[1]);
        return (
          `<div class=ps><b>${recurso[0]}</b>${titulo}<small>` +
          (marca.a == 1 ? "Sin cuenta" : marca.a == 2 ? "Pide cuenta" : "Sin marcar") +
          `${marca.h ? " · oculto" : ""}</small></div>` +
          `<div class=rec-acciones><button class=b2 data-a=ra data-i="${j},1" aria-label="Sin cuenta: ${titulo}">Sin cuenta</button>` +
          `<button class=b2 data-a=ra data-i="${j},2" aria-label="Pide cuenta: ${titulo}">Pide cuenta</button>` +
          `<button class=b2 data-a=rh data-i="${j}" aria-label="${marca.h ? "Mostrar" : "Ocultar"}: ${titulo}">${marca.h ? "Mostrar" : "Ocultar"}</button>` +
          (esExtra ? `<button class=b2 data-a=rd data-i="${j}" aria-label="Quitar: ${titulo}">Quitar</button>` : "") +
          `</div>`
        );
      })
      .join("") || `<p class=mut>Sin recursos todavía.</p>`) +
    `<h3 class=gh>Agregar recurso</h3>` +
    `<label>Título<input id=rt autocomplete=off></label>` +
    `<label>Enlace<input id=ru autocomplete=off placeholder="https://"></label>` +
    `<button class=btn data-a=radd>Agregar</button></section>`
  );
};
/* ---------- 6. INFORMES HTML PARA EL DOCENTE ---------- */
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
const omitidas = (perfil) => suma((leccionDe(perfil) || {}).sk || []);
/** Total de pistas usadas por el perfil. */
const totalPistas = (perfil) => suma((leccionDe(perfil) || {}).h || []);
/** Total de errores del perfil. */
const totalErrores = (perfil) => suma((leccionDe(perfil) || {}).e || []);
/** Quita las etiquetas HTML de un texto (para tablas, CSV y anuncios). */
const textoPlano = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
/**
 * Preguntas de la evaluación respondidas con error por un perfil:
 * [{i índice, tema, p pregunta, ok respuesta correcta, elegidas opciones erradas, fallada (dos intentos)}].
 */
const erroresEvaluacion = (perfil) => {
  const leccion = leccionDe(perfil);
  if (!leccion) return [];
  const respuestas = leccion.a.x || [];
  const intentos = leccion.a.xt || [];
  const elegidas = leccion.a.xw || [];
  return ACTIVIDADES[4].it
    .map((item, i) => ({
      i,
      tema: item.tema,
      p: textoPlano(item.p),
      ok: item.o[item.c],
      elegidas: (elegidas[i] || []).map((o) => item.o[o]).filter(Boolean),
      fallada: respuestas[i] === 2,
      errores: +intentos[i] || 0,
    }))
    .filter((x) => x.errores > 0);
};
/** Porcentaje de estudiantes (que respondieron) que se equivocó al menos una vez en cada pregunta de la evaluación. */
const dificultadEvaluacion = (perfiles) =>
  ACTIVIDADES[4].it.map((item, i) => {
    const respondieron = perfiles.filter((perfil) => ((leccionDe(perfil) || { a: {} }).a.x || [])[i] != null);
    const conError = respondieron.filter((perfil) => +((leccionDe(perfil).a.xt || [])[i] || 0) > 0);
    return { i, tema: item.tema, p: textoPlano(item.p), n: respondieron.length, err: conError.length, pct: porcentaje(conError.length, respondieron.length) };
  });
/** CSS común de los informes descargables (grupal e individual): mismo fondo, tarjetas, tablas, gráficos y barras. */
const CSS_INFORME = `
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
/** Script del fondo animado (constelación) que llevan los informes descargables. */
const JS_FONDO_INFORME = `(function(){var c=document.getElementById("net"),x=c.getContext("2d"),rm=matchMedia("(prefers-reduced-motion:reduce)"),LINK=150,A="94,234,212",C="255,159,128",w=0,h=0,P=[],mx=-999,my=-999,raf=0,t0=0;
function mk(){return{x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:1+Math.random()*1.3,g:Math.random()<.35}}
function draw(){x.clearRect(0,0,w,h);var i,j,a,b,d,p;for(i=0;i<P.length;i++){a=P[i];for(j=i+1;j<P.length;j++){b=P[j];d=Math.hypot(a.x-b.x,a.y-b.y);if(d<LINK){x.strokeStyle="rgba("+(a.g&&b.g?C:A)+","+((1-d/LINK)*.3)+")";x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke()}}}
for(i=0;i<P.length;i++){p=P[i];d=Math.hypot(p.x-mx,p.y-my);if(d<170){x.strokeStyle="rgba("+C+","+((1-d/170)*.5)+")";x.beginPath();x.moveTo(p.x,p.y);x.lineTo(mx,my);x.stroke()}}
for(i=0;i<P.length;i++){p=P[i];x.fillStyle="rgba("+(p.g?C:A)+","+(p.g?.85:.7)+")";x.beginPath();x.arc(p.x,p.y,p.r,0,6.2832);x.fill()}}
function fit(){var d=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;c.width=w*d;c.height=h*d;x.setTransform(d,0,0,d,0,0);var n=Math.min(110,Math.max(26,Math.round(w*h/14000)));while(P.length<n)P.push(mk());P.length=n;draw()}
function tick(t){var k=Math.min((t-t0)/16.7,3)||1,i,p,dx,dy,dd;t0=t;for(i=0;i<P.length;i++){p=P[i];dx=mx-p.x;dy=my-p.y;dd=Math.hypot(dx,dy);if(dd<170&&dd>1){p.x+=dx/dd*.35*k;p.y+=dy/dd*.35*k}p.x+=p.vx*k;p.y+=p.vy*k;if(p.x<-10)p.x=w+10;else if(p.x>w+10)p.x=-10;if(p.y<-10)p.y=h+10;else if(p.y>h+10)p.y=-10}draw();raf=requestAnimationFrame(tick)}
function run(){cancelAnimationFrame(raf);if(!rm.matches&&!document.hidden){t0=performance.now();raf=requestAnimationFrame(tick)}}
addEventListener("pointermove",function(e){mx=e.clientX;my=e.clientY});addEventListener("resize",fit);document.addEventListener("visibilitychange",run);fit();run()})();`;
/** Etiqueta de nivel con su color para los informes (o «–» si no hay nota). */
const chipNivelInforme = (nota) =>
  nota == null ? "<span class=\"nv n\">Sin nota</span>" : `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nivel(nota)}</span>`;
/** Celda con la nota de la actividad k del perfil (Omitida, nota o «–»). */
const celdaActividadInforme = (leccion, k) =>
  !leccion
    ? "<td>–</td>"
    : leccion.sk[k]
      ? "<td class=o>Omitida</td>"
      : `<td>${typeof leccion.sc[k] === "number" ? leccion.sc[k].toFixed(1) : "–"}</td>`;
/** Documento HTML completo de un informe con el encabezado, el contenido y el fondo animado. */
const documentoInforme = (titulo, sobretitulo, h1, subtitulo, contenido) =>
  `<!doctype html><html lang=es><head><meta charset=utf-8>` +
  `<meta name=viewport content="width=device-width,initial-scale=1">` +
  `<title>${titulo}</title><style>${CSS_INFORME}</style></head>` +
  `<body><div class=aur aria-hidden=true><b></b><b></b><b></b></div><canvas id=net aria-hidden=true></canvas>` +
  `<header class=h><small>${sobretitulo}</small><h1>${h1}</h1><p>${subtitulo}</p></header>` +
  `<main class=w>${contenido}` +
  `<p class=m>Superior 4.6–5.0 · Alto 4.0–4.5 · Básico 3.0–3.9 · Bajo 1.0–2.9. Los rangos pueden variar según el sistema de evaluación del colegio.</p>` +
  `</main><script>${JS_FONDO_INFORME}<\/script></body></html>`;
/** Texto con los pesos de la nota, para los informes. */
const textoPesos = () =>
  NOMBRES_ACTIVIDADES.map((n, k) => n + " " + PESOS[k] * 100 + " %").join(", ") +
  ". Cada actividad empieza en 5.0: cada pista resta 0.5 y cada ítem fallado tras dos intentos resta 1.0 (mínimo 1.0). Una actividad omitida vale 1.0.";
/** Barras HTML (escala 1.0–5.0) del promedio de cada actividad para los informes. */
const barrasInforme = (valores) =>
  `<div class=bars>` +
  NOMBRES_ACTIVIDADES.map(
    (nombre, k) =>
      `<div class=br><span>${nombre}</span><i><b class=${claseNivel(valores[k])} style="width:${valores[k] == null ? 0 : ((valores[k] / 5) * 100).toFixed(1)}%"></b></i>` +
      `<strong>${formatoNota(valores[k])}</strong></div>`,
  ).join("") +
  `</div>`;
/** Promedio de la actividad k entre los perfiles que ya la tienen calificada (null si ninguno). */
const promedioActividadGrupo = (perfiles, k) =>
  promedio(
    perfiles
      .map((perfil) => ((leccionDe(perfil) || {}).sc || [])[k])
      .filter((x) => typeof x === "number"),
  );
/** Genera el informe HTML del grupo con los perfiles dados (resumen, actividades, evaluación y reflexiones). */
const informeGrupal = (perfiles) => {
  const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const notas = perfiles.map(notaFinal).filter((x) => x != null);
  const cuenta = (estadoBuscado) => perfiles.filter((perfil) => estadoLeccion(perfil) === estadoBuscado).length;
  const ordenados = [...perfiles].sort((a, b) => normalizar(a.name).localeCompare(normalizar(b.name)));
  const reflexiones = ordenados.filter((perfil) => ((leccionDe(perfil) || { a: {} }).a.r || "").trim());
  const kpi = (valor, texto) => `<div><b>${valor}</b><span>${texto}</span></div>`;
  const contenido =
    `<div class=k>` +
    kpi(perfiles.length, "estudiantes") +
    kpi(formatoNota(promedio(notas)), "promedio (lecciones terminadas)") +
    kpi(porcentaje(cuenta("fin"), perfiles.length) + "%", `terminaron · ${cuenta("fin")}`) +
    kpi(cuenta("curso"), "en curso") +
    kpi(cuenta("sin"), "sin empezar") +
    kpi(perfiles.length ? (suma(perfiles.map(totalPistas)) / perfiles.length).toFixed(1) : "–", "pistas promedio") +
    kpi(suma(perfiles.map(omitidas)), "actividades omitidas") +
    `</div>` +
    `<section><h2>Resumen del grupo</h2><p class=m>Escala 1.0 a 5.0. Pesos: ${textoPesos()}</p>` +
    `<table><tr><th>Estudiante</th><th>Grado</th><th>Estado</th>` +
    ACTIVIDADES_CORTAS.map((a, k) => `<th title="${NOMBRES_ACTIVIDADES[k]}">${a}</th>`).join("") +
    `<th>Final</th><th>Nivel</th><th>Pistas</th><th>Errores</th></tr>` +
    (ordenados
      .map((perfil) => {
        const leccion = leccionDe(perfil);
        const nota = notaFinal(perfil);
        return (
          `<tr><td><strong>${escaparHTML(perfil.name)}</strong></td><td>${perfil.grade}°</td><td>${textoAvance(perfil)}</td>` +
          [0, 1, 2, 3].map((k) => celdaActividadInforme(leccion, k)).join("") +
          `<td><strong>${formatoNota(nota)}</strong>${leccion && typeof leccion.ov === "number" ? " <small>(ajustada)</small>" : ""}</td>` +
          `<td>${chipNivelInforme(nota)}</td><td>${totalPistas(perfil)}</td><td>${totalErrores(perfil)}</td></tr>`
        );
      })
      .join("") || "<tr><td colspan=11>Aún no hay estudiantes.</td></tr>") +
    `</table></section>` +
    `<section><h2>Promedio por actividad</h2><p class=m>Promedio de cada actividad entre quienes ya la resolvieron.</p>` +
    barrasInforme([0, 1, 2, 3].map((k) => promedioActividadGrupo(perfiles, k))) +
    `</section>` +
    `<section><h2>Preguntas de la evaluación</h2><p class=m>Porcentaje de estudiantes que se equivocó al menos una vez en cada pregunta.</p>` +
    `<table><tr><th>Pregunta</th><th>Tema</th><th>Respondieron</th><th>Con error</th></tr>` +
    dificultadEvaluacion(perfiles)
      .map(
        (fila) =>
          `<tr><td>${fila.i + 1}. ${escaparHTML(fila.p)}</td><td>${fila.tema}</td><td>${fila.n}</td><td>${fila.n ? fila.pct + " % (" + fila.err + ")" : "–"}</td></tr>`,
      )
      .join("") +
    `</table></section>` +
    `<section><h2>Reflexiones del cierre</h2><p class=m>Regla si/entonces de la vida diaria escrita por cada estudiante (no se califica).</p>` +
    (reflexiones.length
      ? reflexiones
          .map(
            (perfil) =>
              `<div class=per><h3>${escaparHTML(perfil.name)} <span class="nv n">${perfil.grade}°</span></h3>` +
              `<p>${escaparHTML(leccionDe(perfil).a.r)}</p></div>`,
          )
          .join("")
      : "<p class=m>Aún no hay reflexiones.</p>") +
    `</section>`;
  return documentoInforme(
    `Informe de desempeño · ${BRAND}`,
    `${BRAND} · ${LECCION.t} · 10° y 11°`,
    "Informe de <em>desempeño</em>",
    "Generado el " + fecha,
    contenido,
  );
};
/** Genera el reporte HTML individual de un estudiante. */
const reporteIndividual = (perfil) => {
  const formatoFecha = { day: "numeric", month: "long", year: "numeric" };
  const fecha = new Date().toLocaleDateString("es-CO", formatoFecha);
  const leccion = leccionDe(perfil);
  const nota = notaFinal(perfil);
  const analisis = analisisEstudiante(perfil);
  const errores = erroresEvaluacion(perfil);
  const nombreEsc = escaparHTML(perfil.name);
  const notas = [0, 1, 2, 3].map((k) => (leccion && typeof leccion.sc[k] === "number" ? leccion.sc[k] : null));
  const actualizado = perfil.updatedAt ? new Date(perfil.updatedAt) : null;
  /** Convierte un arreglo de textos en elementos <li> escapados. */
  const listaHTML = (elementos) => elementos.map((texto) => `<li>${escaparHTML(texto)}</li>`).join("");
  const contenido =
    `<section><div class=top><div><h2>${nombreEsc}</h2><p class=m>Grado ${perfil.grade}° · ${textoAvance(perfil)}` +
    (actualizado && !isNaN(actualizado) ? " · última actualización: " + actualizado.toLocaleDateString("es-CO", formatoFecha) : "") +
    `</p></div><div class=big>${formatoNota(nota)} ${nota != null ? chipNivelInforme(nota) : ""}</div></div>` +
    `<p class=lead>` +
    (nota == null
      ? "Aún no termina la lección: la nota final se calculará al terminar el cierre."
      : `<strong>Nivel ${nivel(nota)}.</strong> ${descripcionNivel(nota)}` +
        (typeof leccion.ov === "number" ? ` Nota ajustada por el docente (calculada: ${notaCalculada(leccion).toFixed(1)}).` : "")) +
    `</p></section>` +
    `<div class=k><div><b>${formatoNota(nota)}</b><span>nota final</span></div>` +
    `<div><b>${Math.round(avanceLeccion(perfil) * 100)}%</b><span>avance de la lección</span></div>` +
    `<div><b>${totalPistas(perfil)}</b><span>pistas usadas</span></div>` +
    `<div><b>${totalErrores(perfil)}</b><span>errores</span></div>` +
    `<div><b>${omitidas(perfil)}</b><span>actividades omitidas</span></div></div>` +
    `<section><h2>Notas por actividad</h2><p class=m>Escala 1.0 a 5.0. El color de cada barra indica el nivel de desempeño.</p><div class=chart>` +
    graficoBarrasSVG(
      ACTIVIDADES_CORTAS,
      [{ v: notas, tip: (k) => `${NOMBRES_ACTIVIDADES[k]}: ${notas[k] == null ? "sin calificar" : notas[k].toFixed(1)}` }],
      "rs",
      "Notas por actividad de " + nombreEsc,
      notas.map((x, k) => `${NOMBRES_ACTIVIDADES[k]}: ${x == null ? "sin calificar" : x.toFixed(1)}`).join(", "),
    ) +
    `</div></section>` +
    `<section><h2>Detalle por actividad</h2><p class=m>Pesos: ${textoPesos()}</p>` +
    `<table class=dtab><tr><th>Actividad</th><th>Peso</th><th>Nota</th><th>Pistas</th><th>Errores</th><th>Estado</th></tr>` +
    NOMBRES_ACTIVIDADES.map((nombre, k) => {
      const estadoActividad = !leccion
        ? "Sin empezar"
        : leccion.sk[k]
          ? "Omitida"
          : typeof leccion.sc[k] === "number"
            ? "Resuelta"
            : "Pendiente";
      return (
        `<tr><td>${nombre}</td><td>${PESOS[k] * 100} %</td>` +
        (leccion ? celdaActividadInforme(leccion, k) : "<td>–</td>") +
        `<td>${leccion ? leccion.h[k] : "–"}</td><td>${leccion ? leccion.e[k] : "–"}</td>` +
        `<td${estadoActividad === "Omitida" ? " class=o" : ""}>${estadoActividad}</td></tr>`
      );
    }).join("") +
    `</table></section>` +
    `<section><h2>Errores en la evaluación final</h2>` +
    (errores.length
      ? `<ol>` +
        errores
          .map(
            (x) =>
              `<li><strong>${escaparHTML(x.p)}</strong><br><small>Tema: ${x.tema} · ` +
              (x.fallada ? "fallada tras dos intentos" : "acertada después de una pista") +
              (x.elegidas.length ? " · eligió: «" + x.elegidas.map(escaparHTML).join("», «") + "»" : "") +
              ` · respuesta correcta: «${escaparHTML(x.ok)}»</small></li>`,
          )
          .join("") +
        `</ol>`
      : `<p class=m>${leccion && (leccion.a.x || []).length ? "Respondió todas las preguntas sin errores." : "Aún no responde la evaluación."}</p>`) +
    `</section>` +
    `<section><h2>Reflexión del cierre</h2>` +
    (leccion && (leccion.a.r || "").trim()
      ? `<p class=lead>«${escaparHTML(leccion.a.r.trim())}»</p>`
      : `<p class=m>No escribió reflexión (es opcional y no se califica).</p>`) +
    `</section>` +
    `<section class=ins><div><h2>Fortalezas</h2><ul>${listaHTML(analisis.f)}</ul></div>` +
    `<div><h2>Aspectos a mejorar</h2><ul>${listaHTML(analisis.m)}</ul></div></section>` +
    `<section><h2>Recomendaciones</h2><ol>${listaHTML(analisis.r)}</ol></section>` +
    `<p class=m>Reporte generado el ${fecha} · ${BRAND}</p>`;
  return documentoInforme(
    `Reporte individual · ${nombreEsc} · ${BRAND}`,
    `${BRAND} · ${LECCION.t} · Grado ${perfil.grade}° · Reporte individual`,
    "Reporte de <em>desempeño</em>",
    `${nombreEsc} · Grado ${perfil.grade}° · Generado el ${fecha}`,
    contenido,
  );
};
/** Convierte un nombre en un fragmento seguro para el nombre de archivo. */
const fileSlug = (texto) =>
  normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "estudiante";
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
  capa.className = "capa-dialogo";
  capa.innerHTML =
    `<div class=card>` +
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
/** Pista número nivelPista (0–5) de la ronda de ordenar indicada (cada ronda tiene sus seis pistas graduales). */
const pistaOrdenar = (ronda, nivelPista) => RONDAS_ORDENAR[ronda].p[Math.min(5, nivelPista)];

/* ---------- 8. ACTIVIDADES CON PREGUNTAS (A2, A3 Y EVALUACIÓN) ---------- */
/** Preguntas del paso (2, 3 o 4): texto (p), opciones (o), correcta (c), explicación (e) y pista (pi). */
const preguntasDelPaso = (paso) => {
  const actividad = ACTIVIDADES[paso];
  return actividad.it.map((item) => ({ p: item.p, o: item.o || actividad.o, c: item.c, e: item.e, pi: item.pi }));
};
/**
 * Procesa la respuesta a una pregunta. Acierto: queda en 1. Primer error: suma error y pista (−0.5) y deja otro intento.
 * Segundo error: suma error y la pregunta queda fallada (2, −1.0). Las opciones erradas se guardan para el docente.
 */
const responderPregunta = (seleccion, paso) => {
  const [iPregunta, iOpcion] = seleccion.split(",").map(Number);
  const progreso = progresoLeccion();
  const clave = ACTIVIDADES[paso].k;
  const k = paso - 1;
  const pregunta = preguntasDelPaso(paso)[iPregunta];
  const respuestas = progreso.a[clave] || (progreso.a[clave] = []);
  const intentos = progreso.a[clave + "t"] || (progreso.a[clave + "t"] = []);
  const elegidas = progreso.a[clave + "w"] || (progreso.a[clave + "w"] = []);
  if (!pregunta || respuestas[iPregunta] != null) return;
  if (iOpcion === pregunta.c) respuestas[iPregunta] = 1;
  else {
    intentos[iPregunta] = (intentos[iPregunta] || 0) + 1;
    (elegidas[iPregunta] = elegidas[iPregunta] || []).push(iOpcion);
    progreso.e[k]++;
    if (intentos[iPregunta] >= 2) respuestas[iPregunta] = 2;
    else progreso.h[k]++;
  }
  // Rellena huecos con null para que el arreglo se guarde como JSON sin elementos vacíos
  [respuestas, intentos, elegidas].forEach((lista) => {
    for (let i = 0; i < lista.length; i++) if (lista[i] === undefined) lista[i] = lista === intentos ? 0 : null;
  });
  save();
  focoPendiente = "#fb" + iPregunta;
  announce(
    respuestas[iPregunta] == 1
      ? "Correcto. " + pregunta.e
      : respuestas[iPregunta] == 2
        ? "Revisa. " + textoPlano(pregunta.e)
        : "Pista: " + textoPlano(pregunta.pi),
  );
  render();
};
/** Tarjeta con las preguntas del paso (con pista tras el primer error y explicación al cerrar) y el botón Continuar. */
const vistaPreguntas = (paso, progreso) => {
  const actividad = ACTIVIDADES[paso];
  const preguntas = preguntasDelPaso(paso);
  const respuestas = progreso.a[actividad.k] || [];
  const intentos = progreso.a[actividad.k + "t"] || [];
  const elegidas = progreso.a[actividad.k + "w"] || [];
  const respondidas = respuestas.filter((x) => x != null).length;
  return (
    `<div class=card><h2>${actividad.t}</h2><p class=mut>${actividad.i}</p>` +
    `<p class=mut aria-live=off>Respondidas: <strong>${respondidas} de ${preguntas.length}</strong></p>` +
    preguntas
      .map(
        (pregunta, indice) =>
          `<div class=nd role=group aria-labelledby=q${indice}>` +
          `<div class=q-txt id=q${indice}><span class=q-n>${indice + 1}.</span> ${pregunta.p}</div>` +
          (respuestas[indice] == null
            ? (intentos[indice]
                ? `<div class="fb hint" id=fb${indice} tabindex=-1 role=group aria-labelledby=ft${indice}>` +
                  `<h3 id=ft${indice}>💡 Pista · inténtalo otra vez</h3><p>${pregunta.pi}</p></div>`
                : "") +
              `<div class=opts>` +
              pregunta.o
                .map(
                  (opcion, iOpcion) =>
                    (elegidas[indice] || []).includes(iOpcion)
                      ? `<button class="opt is-wrong" data-a=ck data-i=${indice},${iOpcion} aria-disabled=true data-hint="Ya elegiste esta opción: prueba con otra.">${opcion}<span class=sr> (ya elegida, incorrecta)</span></button>`
                      : `<button class=opt data-a=ck data-i=${indice},${iOpcion}>${opcion}</button>`,
                )
                .join("") +
              `</div>`
            : `<div class="fb ${respuestas[indice] === 1 ? "ok" : ""}" id=fb${indice} tabindex=-1 role=group aria-labelledby=ft${indice}>` +
              `<h3 id=ft${indice}>` +
              (respuestas[indice] === 1
                ? intentos[indice]
                  ? "Correcto (después de la pista)"
                  : "Correcto"
                : "Revisa · la respuesta era «" + pregunta.o[pregunta.c] + "»") +
              `</h3><p>${pregunta.e}</p></div>`) +
          `</div>`,
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
  const leccion = leccionDe(perfil);
  const nota = notaFinal(perfil);
  const pistas = totalPistas(perfil);
  const omitidasTotal = omitidas(perfil);
  const alertas = [];
  if (!leccion) alertas.push(["j", "Sin avance"]);
  else if (!leccion.done) alertas.push(["b", "En curso · " + PASOS_LECCION[Math.min(PASO_CIERRE, +leccion.step || 0)].c]);
  if (nota != null && nota < 3) alertas.push(["j", "Nivel Bajo · " + nota.toFixed(1)]);
  else if (nota != null && nota < 4) alertas.push(["b", "Nivel Básico · " + nota.toFixed(1)]);
  if (pistas >= 6) alertas.push([pistas >= 10 ? "j" : "b", pistas + " pistas"]);
  if (omitidasTotal) alertas.push([omitidasTotal >= 2 ? "j" : "b", omitidasTotal + (omitidasTotal == 1 ? " actividad omitida" : " actividades omitidas")]);
  return alertas;
};
/** Recomendación para cada actividad con nota baja (mismo orden que NOMBRES_ACTIVIDADES). */
const RECOMENDACIONES_ACTIVIDAD = [
  "Practicar la identificación de premisas y conclusión: buscar la afirmación que se apoya en las demás y los conectores «por lo tanto», «porque».",
  "Repasar la diferencia entre validez y verdad con ejemplos propios, y las falacias de afirmar el consecuente y de generalización apresurada.",
  "Traducir situaciones cotidianas a pseudocódigo e identificar en cada una la secuencia, la condición (si… entonces) y la repetición (mientras…).",
  "Volver a la teoría y rehacer en voz alta las preguntas de la evaluación, justificando cada respuesta.",
];
/** Recomendación para cada tema de la evaluación (mismo orden que sus preguntas). */
const RECOMENDACIONES_TEMA = [
  "Señalar premisas y conclusión en argumentos cortos de noticias o redes sociales.",
  "Explicar con sus palabras por qué «Todos los gatos vuelan / Michi es un gato / Michi vuela» es válido aunque sea falso.",
  "Construir dos ejemplos de «afirmar el consecuente» y explicar por qué no se sigue la conclusión.",
  "Convertir reglas generales («todo… que cumple X…») en instrucciones si/entonces.",
  "Escribir un algoritmo cotidiano (una receta o una ruta) con inicio, pasos ordenados y fin.",
];
/** Fortalezas (f), aspectos a mejorar (m) y recomendaciones (r) calculados con los datos de la lección. */
const analisisEstudiante = (perfil) => {
  const leccion = leccionDe(perfil);
  const fortalezas = [];
  const aMejorar = [];
  const recomendaciones = [];
  if (!leccion)
    return {
      f: ["Aún no hay actividades resueltas para identificar fortalezas."],
      m: ["Aún no inicia la lección."],
      r: ["Acompañar el inicio: leer el objetivo y la teoría y resolver la Actividad 1."],
    };
  const nota = notaFinal(perfil);
  if (!leccion.done) {
    aMejorar.push("Lección en curso: va en «" + PASOS_LECCION[Math.min(PASO_CIERRE, +leccion.step || 0)].n + "».");
    recomendaciones.push("Terminar la lección (hasta el cierre) para obtener la nota final.");
  } else fortalezas.push("Terminó la lección completa.");
  if (nota != null && nota >= 4) fortalezas.push(`Nota final en nivel ${nivel(nota)} (${nota.toFixed(1)}).`);
  const altas = [];
  const bajas = [];
  leccion.sc.forEach((valor, k) => {
    if (typeof valor !== "number" || leccion.sk[k]) return;
    if (valor >= 4.5) altas.push(`${NOMBRES_ACTIVIDADES[k]} (${valor.toFixed(1)})`);
    else if (valor < 3.5) {
      bajas.push(`${NOMBRES_ACTIVIDADES[k]} (${valor.toFixed(1)})`);
      recomendaciones.push(RECOMENDACIONES_ACTIVIDAD[k]);
    }
  });
  if (altas.length) fortalezas.push(`Se destaca en ${altas.join(", ")}.`);
  if (bajas.length) aMejorar.push(`Nota baja en ${bajas.join(", ")}.`);
  const textoOmitidas = NOMBRES_ACTIVIDADES.filter((_, k) => leccion.sk[k]);
  if (textoOmitidas.length) {
    aMejorar.push(`Omitió: ${textoOmitidas.join(", ")}.`);
    recomendaciones.push("Resolver las actividades omitidas con acompañamiento: cada una contó 1.0 en la nota.");
  }
  const pistas = totalPistas(perfil);
  const errores = totalErrores(perfil);
  const resueltas = leccion.sc.filter((x, k) => typeof x === "number" && !leccion.sk[k]).length;
  if (resueltas) {
    if (pistas <= 1) fortalezas.push(`Trabaja con autonomía: usó ${pistas} ${pistas == 1 ? "pista" : "pistas"}.`);
    else if (pistas >= 6) {
      aMejorar.push(`Depende de las pistas: usó ${pistas}.`);
      recomendaciones.push("Releer la teoría y los ejemplos antes de responder, para depender menos de las pistas.");
    }
    if (errores <= 2) fortalezas.push(`Comete pocos errores (${errores}).`);
    else if (errores >= 8) aMejorar.push(`Comete muchos errores (${errores}): conviene leer con calma y justificar antes de elegir.`);
  }
  const fallos = erroresEvaluacion(perfil);
  if (fallos.length) {
    aMejorar.push("En la evaluación tuvo dificultad con: " + fallos.map((x) => x.tema.toLowerCase()).join(", ") + ".");
    fallos.forEach((x) => recomendaciones.push(RECOMENDACIONES_TEMA[x.i]));
  } else if ((leccion.a.x || []).filter((x) => x != null).length == ACTIVIDADES[4].it.length)
    fortalezas.push("Respondió la evaluación final sin errores.");
  if ((leccion.a.r || "").trim().length >= MINIMO_REFLEXION)
    fortalezas.push("Escribió una reflexión de cierre con una regla si/entonces propia.");
  if (nota != null && nota < 3)
    recomendaciones.push("Plan de refuerzo con acompañamiento docente: repasar la teoría y rehacer las actividades con apoyo.");
  if (!fortalezas.length) fortalezas.push("Aún no se identifican fortalezas destacadas; se harán visibles al avanzar en la lección.");
  if (!aMejorar.length) aMejorar.push("No se identifican aspectos críticos con los datos actuales.");
  if (!recomendaciones.length)
    recomendaciones.push("Mantener el ritmo y proponer retos de profundización con los recursos «Para profundizar».");
  return { f: fortalezas, m: aMejorar, r: [...new Set(recomendaciones)] };
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
/** Barras horizontales de avance: filas [{l: etiqueta HTML, avance 0–1, nota|null, t: tooltip escapado, x: texto del valor}]. */
const barrasAvance = (filas) =>
  `<ul class="hb hb--stu">` +
  (filas
    .map(
      (fila) =>
        `<li title="${fila.t}"><span class=hb__l>${fila.l}</span>` +
        `<span class=hb__t aria-hidden=true><i class="hb__f ${fila.nota == null ? "lp" : claseNivel(fila.nota)}" style="width:${Math.max(fila.avance ? 2 : 0, fila.avance * 100).toFixed(1)}%"></i></span>` +
        `<span class=hb__v>${fila.nota == null ? "–" : fila.nota.toFixed(1)}<small>${fila.x}</small></span></li>`,
    )
    .join("") || `<li class=mut>Sin datos con los filtros actuales.</li>`) +
  `</ul>`;
/** Barras horizontales de porcentaje (0–100): filas [{l: etiqueta HTML, pct, t: tooltip escapado, x: texto extra}]. */
const barrasPorcentaje = (filas) =>
  `<ul class="hb hb--pct">` +
  filas
    .map(
      (fila) =>
        `<li title="${fila.t}"><span class=hb__l>${fila.l}</span>` +
        `<span class=hb__t aria-hidden=true><i class="hb__f ${fila.pct >= 50 ? "lj" : fila.pct >= 25 ? "lb" : "ls"}" style="width:${Math.max(fila.pct ? 2 : 0, fila.pct)}%"></i></span>` +
        `<span class=hb__v>${fila.pct} %<small>${fila.x}</small></span></li>`,
    )
    .join("") +
  `</ul>`;
/** Panel de detalle del estudiante seleccionado (estudianteSeleccionado). */
const detalleEstudiante = (clave, perfil) => {
  const leccion = leccionDe(perfil);
  const nota = notaFinal(perfil);
  const analisis = analisisEstudiante(perfil);
  const errores = erroresEvaluacion(perfil);
  const actualizado = perfil.updatedAt ? new Date(perfil.updatedAt) : null;
  const nombreEsc = escaparHTML(perfil.name);
  const claveEsc = escaparHTML(clave);
  const notas = [0, 1, 2, 3].map((k) => (leccion && typeof leccion.sc[k] === "number" ? leccion.sc[k] : null));
  const reflexion = leccion ? (leccion.a.r || "").trim() : "";
  return (
    `<section class="card det" id=stu-detail aria-labelledby=det-h>` +
    `<div class=det__top><div><p class=ey>Detalle del estudiante</p>` +
    `<h2 id=det-h>${nombreEsc}</h2><p class=mut><span class=pill>${perfil.grade}°</span> ${textoAvance(perfil)}` +
    (actualizado && !isNaN(actualizado)
      ? " · actualizado el " + actualizado.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
      : "") +
    `</p></div><div class=det__grade><strong>${formatoNota(nota)}</strong>` +
    (nota == null
      ? "<small>Sin nota final</small>"
      : `<span class="nv ${CLASE_NIVEL[nivel(nota)]}">${nivel(nota)}</span>` +
        (typeof leccion.ov === "number" ? `<small>ajustada ✎ · calculada ${notaCalculada(leccion).toFixed(1)}</small>` : "<small>nota final</small>")) +
    `</div></div>` +
    barraProgreso(avanceLeccion(perfil) * 100, "Avance de " + nombreEsc) +
    `<div class="tl tl--sm"><div><strong>${Math.round(avanceLeccion(perfil) * 100)}<small>%</small></strong><span>avance</span></div>` +
    `<div><strong>${totalPistas(perfil)}</strong><span>pistas usadas</span></div>` +
    `<div><strong>${totalErrores(perfil)}</strong><span>errores</span></div>` +
    `<div><strong>${omitidas(perfil)}</strong><span>actividades omitidas</span></div></div>` +
    `<div class=dg><figure class=chartbox><figcaption>Notas por actividad</figcaption>` +
    graficoBarrasSVG(
      ACTIVIDADES_CORTAS,
      [{ v: notas, tip: (k) => `${NOMBRES_ACTIVIDADES[k]}: ${notas[k] == null ? "sin calificar" : notas[k].toFixed(1) + " · " + nivel(notas[k])}` }],
      "sd",
      "Notas por actividad de " + nombreEsc,
      notas.map((x, k) => `${NOMBRES_ACTIVIDADES[k]}: ${x == null ? "sin calificar" : x.toFixed(1)}`).join(", "),
    ) +
    `</figure><div class=tw><table class="dt dt--det"><caption class=sr>Detalle por actividad de ${nombreEsc}</caption>` +
    `<tr><th scope=col>Actividad</th><th scope=col>Peso</th><th scope=col>Nota</th><th scope=col>Pistas</th><th scope=col>Errores</th></tr>` +
    NOMBRES_ACTIVIDADES.map(
      (nombre, k) =>
        `<tr><th scope=row>${ACTIVIDADES_CORTAS[k]}<small>${nombre}</small></th><td>${PESOS[k] * 100} %</td><td>` +
        (!leccion ? "–" : leccion.sk[k] ? "<span class=om-t>Omitida</span>" : notas[k] == null ? "–" : chipNota(notas[k])) +
        `</td><td>${leccion ? leccion.h[k] : "–"}</td><td>${leccion ? leccion.e[k] : "–"}</td></tr>`,
    ).join("") +
    `</table></div></div>` +
    `<div class=dg><div class="ins ins--f"><h3>Fortalezas</h3><ul>` +
    analisis.f.map((x) => `<li>${escaparHTML(x)}</li>`).join("") +
    `</ul></div><div class="ins ins--m"><h3>Aspectos a mejorar</h3><ul>` +
    analisis.m.map((x) => `<li>${escaparHTML(x)}</li>`).join("") +
    `</ul></div></div>` +
    `<h3 class=gh>Errores en la evaluación final</h3>` +
    (errores.length
      ? `<ul class=ev-err>` +
        errores
          .map(
            (x) =>
              `<li><strong>${escaparHTML(x.p)}</strong><small>${x.tema} · ` +
              (x.fallada ? "fallada tras dos intentos" : "acertada después de una pista") +
              (x.elegidas.length ? " · eligió «" + x.elegidas.map(escaparHTML).join("», «") + "»" : "") +
              ` · correcta: «${escaparHTML(x.ok)}»</small></li>`,
          )
          .join("") +
        `</ul>`
      : `<p class=mut>${leccion && (leccion.a.x || []).length ? "Sin errores en la evaluación." : "Aún no responde la evaluación."}</p>`) +
    `<h3 class=gh>Reflexión del cierre</h3>` +
    (reflexion ? `<blockquote class=reflexion>${escaparHTML(reflexion)}</blockquote>` : `<p class=mut>Sin reflexión (es opcional).</p>`) +
    `<div class=det__acts><button class=btn data-a=repstu data-i="${claveEsc}">⬇ Descargar reporte del estudiante</button>` +
    `<button class=b2 data-a=dsel data-i="">Cerrar detalle</button></div></section>`
  );
};
/* ---------- 10. VISTAS (vistas) ---------- */
/** HTML de la portada tal como viene en index.html (se captura antes del primer render para poder volver a ella). */
const PORTADA_ESTATICA = (() => {
  const portada = document.querySelector("#app main.cover");
  return portada ? portada.outerHTML : "<main class=cover><h1>" + BRAND + "</h1></main>";
})();
/** Vistas de la app: cada método devuelve el HTML de la pantalla (la clave es el valor de vistaActual). */
const vistas = {
  /** Portada: el mismo HTML estático de index.html (capturado al cargar), sin volver a escribirlo en JS. */
  cover() {
    return PORTADA_ESTATICA;
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
  /** Inicio: elegir o crear perfil, código personal y cómo funciona la lección. */
  home() {
    const perfiles = Object.entries(estado.p);
    const conCodigo = perfiles.filter(([, perfil]) => perfil && perfil.accessCode);
    return (
      `<main><div class=intro><p class=ey>Lógica · Filosofía e informática</p>` +
      `<h1>Del silogismo al <em>algoritmo.</em></h1><p class="mut lead">Una lección corta para descubrir cómo un razonamiento se convierte en reglas que una máquina puede seguir. Ideal para 10° y 11°.</p>` +
      `</div><section class=card><h2>¿Quién va a estudiar?</h2>` +
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
      `<div class=row><label>Nombre<input id=nm value="${escaparHTML(nombreFormulario)}" placeholder="Escribe tu nombre" autocomplete=off>` +
      `</label><label>Grado<select id=gr><option value="">Selecciona</option>` +
      `<option value=10 ${gradoFormulario === "10" ? "selected" : ""}>10°</option>` +
      `<option value=11 ${gradoFormulario === "11" ? "selected" : ""}>11°</option>` +
      `</select></label></div>` +
      (mensajeError ? `<p class=err>${escaparHTML(mensajeError)}</p>` : "") +
      (LOCAL_ONLY
        ? ""
        : `<p class=server-note>¿Ya tienes un código personal? Abre tu perfil desde cualquier dispositivo.</p>` +
          `<div class=access-row><label>Código personal<input id=ac autocomplete=off inputmode=text placeholder="Pega tu código de acceso">` +
          `</label><button class=btn data-a=access ${accessBusy ? "disabled" : ""}>Abrir mi perfil</button></div>` +
          (accessBusy ? `<p class=mut>Conectando con tu perfil…</p>` : "")) +
      (issuedCode
        ? `<div class=code-box role=status><div><strong>Guarda tu código personal</strong>` +
          `<p>Úsalo para continuar en otro dispositivo.</p><code>${escaparHTML(issuedCode)}</code></div>` +
          `<button class=b2 data-a=copy-code>Copiar código</button></div>`
        : "") +
      `</section>` +
      (conCodigo.length
        ? `<section class=card id=saved-profile-codes><h2>Códigos personales guardados</h2>` +
          `<p class=mut>Disponibles en este dispositivo para abrir cada perfil en otro equipo.</p>` +
          conCodigo
            .map(
              ([clave, perfil]) =>
                `<div class=code-box><div><strong>${escaparHTML(perfil.name)} · ${perfil.grade}°</strong>` +
                `<br><code>${escaparHTML(perfil.accessCode)}</code></div>` +
                `<button class=b2 data-a=copy-saved data-i="${escaparHTML(clave)}" aria-label="Copiar código personal de ${escaparHTML(perfil.name)}">Copiar código</button></div>`,
            )
            .join("") +
          `</section>`
        : "") +
      `<p class=mut>Tu progreso queda guardado en este dispositivo` +
      (LOCAL_ONLY ? "." : " y se sincroniza cuando hay conexión.") +
      `</p><div class="sum sum--inicio"><span><strong>1</strong>lección enfocada</span>` +
      `<span><strong>45</strong>minutos</span><span><strong>3 + 1</strong>actividades y evaluación</span>` +
      `<span><strong>1.0–5.0</strong>escala de nota</span></div><p class=ey>Cómo funciona</p><div class=rg>` +
      [
        ["📖", "Lee la teoría", "El argumento, el silogismo y el paso al algoritmo, con ejemplos. Puedes volver a ella cuando quieras."],
        ["🧩", "Practica", "Arma silogismos, decide si un razonamiento es válido y tradúcelo a un algoritmo."],
        ["✅", "Evalúate", "Cinco preguntas finales. Si te equivocas, recibes una pista y otra oportunidad."],
        ["⚖️", "Obtén tu nota", "Cada actividad pesa distinto; las pistas y los errores bajan un poco su nota."],
      ]
        .map(
          (tarjeta) =>
            `<div class=card><span class=ic aria-hidden=true>${tarjeta[0]}</span>` +
            `<h2>${tarjeta[1]}</h2><p class=mut>${tarjeta[2]}</p></div>`,
        )
        .join("") +
      `</div><section class="card cta"><h2>¿Listo para empezar?</h2>` +
      `<p class=mut>Escribe tu nombre y elige tu grado en el recuadro de arriba.</p>` +
      (mensajeError ? `<p class=err>${escaparHTML(mensajeError)}</p>` : "") +
      `<button class=btn data-a=start>Comenzar</button>` +
      (perfiles.length ? `<button class=b2 data-a=wipe>Borrar mis datos</button>` : "") +
      `</section></main>`
    );
  },
  /** Tu lección: objetivo, duración, avance y los seis pasos con su estado; botón Empezar/Continuar o Ver resultado. */
  leccion() {
    const leccion = leccionDe(usuario);
    const paso = leccion ? Math.min(PASO_CIERRE, +leccion.step || 0) : -1;
    const terminada = !!(leccion && leccion.done);
    return (
      `<main><button class="b2 back" data-a=home>← Inicio</button>` +
      `<p class=ey>Tu lección · ${escaparHTML(usuario.name)} · ${usuario.grade}°</p><h1>${LECCION.t}</h1>` +
      `<p class="mut lead">Pregunta guía: ${LECCION.q}</p>` +
      `<section class="card objetivo"><p class=ey>Objetivo de aprendizaje</p><p>${LECCION.obj}</p>` +
      `<p class=mut>Duración estimada: ${LECCION.dur} · ${textoAvance(usuario)}` +
      (terminada ? ` · Nota final: <strong>${notaFinalTexto(usuario)}</strong> (${nivel(notaFinal(usuario))})` : "") +
      `</p>${barraProgreso(avanceLeccion(usuario) * 100, "Avance de la lección")}` +
      `<div class=acciones-leccion>` +
      (terminada
        ? `<button class=btn data-a=final>Ver mi resultado</button><button class=b2 data-a=empezar>📖 Repasar la teoría</button>`
        : `<button class=btn data-a=empezar>${leccion ? "Continuar la lección" : "Empezar la lección"}</button>`) +
      `</div></section>` +
      `<ol class=route aria-label="Pasos de la lección">` +
      PASOS_LECCION.map((datosPaso, i) => {
        const hecho = terminada || i < paso;
        const actual = !terminada && i === paso;
        const k = i - 1;
        const notaPaso =
          hecho && leccion && k >= 0 && k < 4
            ? leccion.sk[k]
              ? " · omitida"
              : typeof leccion.sc[k] === "number"
                ? " · " + leccion.sc[k].toFixed(1)
                : ""
            : "";
        return (
          `<li class="node ${hecho ? "is-done" : actual ? "is-active" : "is-locked"}" style="--n:${i}">` +
          `<span class=node__dot aria-hidden=true>${i + 1}</span><div class=node__card>` +
          `<span class=node__state>${hecho ? "Completado" + notaPaso : actual ? "En curso" : "Pendiente"}</span>` +
          `<span class=node__title>${datosPaso.n}</span>` +
          `<span class=node__topic>~${datosPaso.m} min` +
          (k >= 0 && k < 4 ? ` · vale ${PESOS[k] * 100} % de la nota` : i === 0 ? " · objetivo, teoría y recursos" : " · ideas clave, reflexión y nota") +
          `</span></div></li>`
        );
      }).join("") +
      `</ol></main>`
    );
  },
  /** Lección abierta: teoría, actividades, evaluación y cierre según el paso (o repaso de la teoría si ya terminó). */
  unit() {
    const progreso = progresoLeccion();
    const paso = progreso.step;
    let cuerpo = "";
    if (progreso.done) cuerpo = vistaTeoria() + `<button class=btn data-a=leccion>← Volver a mi lección</button>`;
    else if (viendoTeoria) cuerpo = vistaTeoria() + `<button class=btn data-a=bk>← Volver a la actividad</button>`;
    else if (paso == 0) cuerpo = vistaTeoria() + `<button class=btn data-a=nx>Ir a las actividades</button>`;
    else if (paso == 1) {
      const ronda = Math.min(RONDAS_ORDENAR.length - 1, +progreso.a.o || 0);
      const datosRonda = RONDAS_ORDENAR[ronda];
      if (!estadoOrdenar) estadoOrdenar = { pool: barajar(datosRonda.o.map((_, i) => i)), sl: [] };
      cuerpo =
        `<div class=card><h2>Actividad 1 · Arma el silogismo</h2><p class=ey>${datosRonda.n}</p>` +
        `<p class=mut>${datosRonda.i} Toca los bloques en orden; toca un bloque colocado para devolverlo.</p>` +
        `<div class=bl role=group aria-label="Bloques por ordenar">` +
        estadoOrdenar.pool.map((i) => `<button class=blk data-a=dp data-i=${i}>${datosRonda.o[i]}</button>`).join("") +
        `</div><div role=group aria-label="Tu orden">` +
        estadoOrdenar.sl
          .map(
            (i, n) =>
              `<div class=slot data-n=${n + 1}><button class=blk data-a=dr data-i=${i} aria-label="Posición ${n + 1}: ${escaparHTML(datosRonda.o[i])}. Actívalo para devolverlo a la lista.">${datosRonda.o[i]}</button></div>`,
          )
          .join("") +
        `</div>${bloqueRetroalimentacion()}<button class=btn data-a=dc ` +
        (estadoOrdenar.pool.length ? 'aria-disabled=true data-hint="Coloca todos los bloques para poder comprobar."' : "") +
        `>Comprobar</button></div>`;
    } else if (paso >= 2 && paso <= 4) cuerpo = vistaPreguntas(paso, progreso);
    else {
      const nota = notaCalculada(progreso);
      const nivelTexto = nivel(nota);
      const reflexion = progreso.a.r || "";
      cuerpo =
        `<div class=card><h2>Cierre · tres ideas clave</h2><ol class=ideas>` +
        IDEAS_CLAVE.map((idea) => `<li>${idea}</li>`).join("") +
        `</ol></div><div class=card><h2>Reflexión <small class=mut>(opcional, no se califica)</small></h2>` +
        `<div class=write><label for=tr id=ltr>Escribe una regla si/entonces de tu vida diaria y di si el razonamiento que la usa es válido (sugerido: mínimo ${MINIMO_REFLEXION} caracteres).</label>` +
        `<textarea id=tr rows=5 aria-labelledby=ltr aria-describedby=cnt-tr placeholder="Ejemplo: Si suena la alarma, entonces me levanto. Sonó la alarma, así que me levanto: es válido (modus ponens).">${escaparHTML(reflexion)}</textarea>` +
        contadorCaracteres("tr", reflexion, MINIMO_REFLEXION) +
        `</div></div><div class=card><h2>Tu resultado</h2>` +
        NOMBRES_ACTIVIDADES.map(
          (nombre, k) =>
            `<div class=ps><b>${PESOS[k] * 100}%</b>${nombre}<small>` +
            (progreso.sk[k] ? "omitida · 1.0" : typeof progreso.sc[k] === "number" ? progreso.sc[k].toFixed(1) : "–") +
            ` · pistas: ${progreso.h[k]} · errores: ${progreso.e[k]}</small></div>`,
        ).join("") +
        `<h2 class=grade-h>Nota de la lección: <strong data-count="${nota.toFixed(1)}">${nota.toFixed(1)}</strong> · ${nivelTexto}</h2>` +
        NIVELES.map(
          (nombreNivel, indiceNivel) =>
            `<p class="${nombreNivel === nivelTexto ? "" : "mut"}"><strong>${nombreNivel}.</strong> ` +
            `Identifica premisas y conclusión, distingue la validez de la verdad y traduce razonamientos a reglas si/entonces ${SUFIJOS_NIVEL[indiceNivel]}.</p>`,
        ).join("") +
        `<p class="mut nota-rangos">Los rangos (Superior 4.6–5.0, Alto 4.0–4.5, Básico 3.0–3.9, Bajo 1.0–2.9) pueden variar según el sistema de evaluación de tu colegio.</p>` +
        `<button class=btn data-a=fin>Terminar</button><button class=b2 data-a=creditos>Créditos</button></div>`;
    }
    const enActividad = !progreso.done && !viendoTeoria && paso > 0;
    return (
      `<main class=unit-head><button class="b2 back" data-a=leccion>← Mi lección</button>` +
      `<p class=ey>Lección · ${usuario.grade}°</p><h1>${LECCION.t}</h1><p class="mut lead">${LECCION.q}</p>` +
      `<ol class=steps aria-label="Pasos de la lección">` +
      PASOS_LECCION.map((datosPaso, i) => {
        const pasoVisible = progreso.done ? PASOS_LECCION.length : paso;
        return (
          `<li class="pill ${i == pasoVisible ? "on" : i < pasoVisible ? "is-past" : ""}"${i == pasoVisible ? " aria-current=step" : ""}>${datosPaso.p}` +
          (i == pasoVisible ? "<span class=sr> (paso actual)</span>" : i < pasoVisible ? "<span class=sr> (hecho)</span>" : "") +
          `</li>`
        );
      }).join("") +
      `</ol>${cuerpo}` +
      (enActividad
        ? `<div class=helpers><button class=b2 data-a=th>📖 Volver a la teoría</button>` +
          (paso <= 4 ? `<button class=b2 data-a=om>Omitir · vale ${PESOS[paso - 1] * 100}% de la nota</button>` : "") +
          `</div>`
        : "") +
      `</main>`
    );
  },
  /** Resultado final al terminar la lección. */
  final() {
    const leccion = leccionDe(usuario);
    if (!leccion || !leccion.done)
      return (
        `<main><button class="b2 back" data-a=leccion>← Mi lección</button><h1>Aún no hay resultado</h1>` +
        `<div class=card><p class=mut>Termina la lección hasta el cierre para ver tu nota final.</p>` +
        `<button class=btn data-a=leccion>Ir a mi lección</button></div></main>`
      );
    const nota = notaLeccion(leccion);
    return (
      `<main><p class=ey>Lección completada</p><h1>¡Terminaste la <em>lección!</em></h1>` +
      `<p class=mut>${escaparHTML(usuario.name)} · ${usuario.grade}° · ${LECCION.t}</p>` +
      `<div class=sum><span class=final-grade><strong data-count="${nota.toFixed(1)}">${nota.toFixed(1)}</strong>nota final</span>` +
      `<span><strong>${nivel(nota)}</strong>nivel</span>` +
      `<span><strong>${totalPistas(usuario)}</strong>pistas usadas</span>` +
      `<span><strong>${omitidas(usuario)}</strong>omitidas</span></div>` +
      `<div class=card><h2>Nivel ${nivel(nota)}</h2><p>${descripcionNivel(nota)}</p>` +
      (typeof leccion.ov === "number" ? `<p class=mut>Tu docente ajustó la nota (calculada: ${notaCalculada(leccion).toFixed(1)}).</p>` : "") +
      NOMBRES_ACTIVIDADES.map(
        (nombre, k) =>
          `<div class=ps><b>${ACTIVIDADES_CORTAS[k]}</b>${nombre}<small>` +
          (leccion.sk[k] ? "omitida · 1.0" : typeof leccion.sc[k] === "number" ? leccion.sc[k].toFixed(1) + " · " + nivel(leccion.sc[k]) : "–") +
          ` · pistas: ${leccion.h[k]}</small></div>`,
      ).join("") +
      ((leccion.a.r || "").trim() ? `<h3 class=gh>Tu reflexión</h3><blockquote class=reflexion>${escaparHTML(leccion.a.r.trim())}</blockquote>` : "") +
      `</div><div class=acciones-leccion><button class=btn data-a=leccion>Volver a mi lección</button>` +
      `<button class=b2 data-a=creditos>Créditos</button><button class=b2 data-a=home>Ir al inicio</button></div></main>`
    );
  },
  /** Créditos del OVA: autores, institución, fuentes del contenido, recursos técnicos y licencia de uso. */
  creditos() {
    const lista = (elementos) => `<ul class=cred-list>` + elementos.map((x) => `<li>${x}</li>`).join("") + `</ul>`;
    const enlace = (texto, url) =>
      `<a href="${url}" target=_blank rel=noopener>${texto}<span class=sr> (se abre en una pestaña nueva)</span></a>`;
    return (
      `<main><button class="b2 back" data-a=volver>← Volver</button>` +
      `<p class=ey>${BRAND} · ${LECCION.t}</p><h1>Créditos</h1>` +
      htmlEquipo() +
      `<section class="card creditos__inst" aria-label="Datos del OVA">` +
      `<img class=creditos__logo src="${LOGO_UNIVERSIDAD}" width=640 height=191 alt="Universidad de Córdoba">` +
      lista([
        "<strong>OVA:</strong> SOPHIALAP · Lógica: del silogismo al algoritmo",
        "<strong>Asignatura:</strong> Fundamentos de Algoritmia",
        "<strong>Grupo:</strong> P.V.C Education",
        "<strong>Programa:</strong> Licenciatura en Informática y Medios Audiovisuales",
        "<strong>Facultad:</strong> Facultad de Educación y Ciencias Humanas",
        "<strong>Institución:</strong> Universidad de Córdoba (Colombia)",
        "<strong>Año:</strong> 2026",
        "<strong>Público:</strong> estudiantes de grados 10° y 11°",
      ]) +
      `</section><section class=card aria-labelledby=cr-fuentes><h2 id=cr-fuentes>Referencias y fuentes del contenido</h2>` +
      lista([
        "Aristóteles. <em>Analíticos primeros</em> (Órganon), siglo IV a. C.: el silogismo y sus premisas.",
        "Gottfried W. Leibniz. Proyecto de una <em>characteristica universalis</em> y de un cálculo del razonamiento, siglo XVII.",
        "George Boole. <em>An Investigation of the Laws of Thought</em>, 1854: el álgebra de verdadero y falso.",
        "Alan M. Turing. «On Computable Numbers, with an Application to the Entscheidungsproblem», 1936: la máquina que sigue reglas.",
        ...RECURSOS_LECCION.map(([, titulo, url]) => enlace(escaparHTML(titulo), url)),
      ]) +
      `<p class=mut>Los ejemplos, actividades y preguntas de la lección son de elaboración propia de los autores.</p></section>` +
      `<section class=card aria-labelledby=cr-recursos><h2 id=cr-recursos>Recursos usados</h2>` +
      lista([
        "Tipografías de " + enlace("Google Fonts", "https://fonts.google.com") + ": Cormorant Garamond, Inter y Cinzel.",
        "Datos de estudiantes y del panel docente guardados en " + enlace("Supabase", "https://supabase.com") + ".",
        "Sitio publicado en " + enlace("GitHub Pages", "https://pages.github.com") + ".",
        "Desarrollado con HTML, CSS y JavaScript sin librerías externas; ilustraciones y escudo propios del proyecto.",
      ]) +
      `</section><section class=card aria-labelledby=cr-licencia><h2 id=cr-licencia>Licencia y uso</h2>` +
      `<p>Recurso educativo de uso libre y sin fines de lucro para el aula. Puedes usarlo y compartirlo citando a los autores y a la Universidad de Córdoba. Los recursos externos enlazados pertenecen a sus respectivos autores.</p>` +
      `</section><button class=btn data-a=volver>← Volver</button></main>`
    );
  },
  /** Panel docente: filtros, indicadores, gráficos, alertas, tabla, registro y recursos. */
  doc() {
    if (!teacherReady)
      return (
        `<main><div class=card><h1>Conectando con el panel docente…</h1>` +
        `<p class=mut>Se comprobará la sesión antes de solicitar la lista y los recursos.</p></div></main>`
      );
    // Tablero: el filtro (grado + búsqueda) define el grupo `filtrados` sobre el que se calculan KPIs, gráficos, alertas y tabla
    const mapa = teacherMap();
    const todos = Object.entries(mapa);
    const busqueda = normalizar(filtroDocente.q).trim();
    const filtrados = todos.filter(
      ([, perfil]) =>
        (!filtroDocente.g || perfil.grade === filtroDocente.g) && (!busqueda || normalizar(perfil.name).includes(busqueda)),
    );
    const perfiles = filtrados.map(([, perfil]) => perfil);
    const total = perfiles.length;
    const notas = perfiles.map(notaFinal).filter((x) => x != null);
    /** Cantidad de perfiles filtrados en un estado de la lección (sin, curso, fin). */
    const cuenta = (estadoBuscado) => perfiles.filter((perfil) => estadoLeccion(perfil) === estadoBuscado).length;
    const terminaron = cuenta("fin");
    const distribucion = distribucionNiveles(perfiles);
    const grados = filtroDocente.g ? [filtroDocente.g] : ["10", "11"];
    /** Comparador por nombre normalizado. */
    const byName = (a, b) => normalizar(a.name).localeCompare(normalizar(b.name));
    if (estudianteSeleccionado && !mapa[estudianteSeleccionado]) estudianteSeleccionado = null;
    const gruposGrado = [...ACTIVIDADES_CORTAS, "Final"];
    const seriesGrado = grados.map((g) => {
      const delGrado = perfiles.filter((perfil) => perfil.grade === g);
      /** Valores (notas) del grupo k: actividades 0–3 o nota final (4). */
      const valores = (k) =>
        k < 4
          ? delGrado.map((perfil) => ((leccionDe(perfil) || {}).sc || [])[k]).filter((x) => typeof x === "number")
          : delGrado.map(notaFinal).filter((x) => x != null);
      const promedios = gruposGrado.map((_, k) => promedio(valores(k)));
      return {
        g,
        c: "c" + g,
        v: promedios,
        tip: (k) => {
          const n = valores(k).length;
          return `Grado ${g}° · ${k < 4 ? NOMBRES_ACTIVIDADES[k] : "Nota final"}: ${n ? promedios[k].toFixed(1) : "sin datos"} (${n} ${n == 1 ? "estudiante" : "estudiantes"})`;
        },
      };
    });
    const seriesActividad = NOMBRES_ACTIVIDADES.map((nombre, k) => {
      const media = promedioActividadGrupo(perfiles, k);
      const n = perfiles.filter((perfil) => typeof ((leccionDe(perfil) || {}).sc || [])[k] === "number").length;
      const omisiones = suma(perfiles.map((perfil) => ((leccionDe(perfil) || {}).sk || [])[k]));
      return {
        l: ACTIVIDADES_CORTAS[k] + " · " + nombre,
        v: media,
        t: `${nombre}: promedio ${formatoNota(media)} en ${n} ${n == 1 ? "estudiante" : "estudiantes"} · omitida ${omisiones} ${omisiones == 1 ? "vez" : "veces"}`,
        x: omisiones ? omisiones + " omit." : "",
      };
    });
    const avanceEstudiantes = [...filtrados]
      .sort(([, a], [, b]) => {
        const x = notaFinal(a);
        const y = notaFinal(b);
        if (x != null || y != null) return x == null ? 1 : y == null ? -1 : y - x || byName(a, b);
        return avanceLeccion(b) - avanceLeccion(a) || byName(a, b);
      })
      .map(([k, perfil]) => {
        const g = notaFinal(perfil);
        return {
          l:
            `<button class=hb__btn data-a=dsel data-i="${escaparHTML(k)}" aria-label="Ver detalle de ${escaparHTML(perfil.name)}">${escaparHTML(perfil.name)} <small>${perfil.grade}°</small></button>`,
          avance: avanceLeccion(perfil),
          nota: g,
          t: `${escaparHTML(perfil.name)} · ${perfil.grade}° · ${textoAvance(perfil)} · nota ${formatoNota(g)}${g != null ? " (" + nivel(g) + ")" : ""}`,
          x: g != null ? "terminó" : estadoLeccion(perfil) === "sin" ? "sin empezar" : "paso " + (Math.min(PASO_CIERRE, +leccionDe(perfil).step || 0) + 1) + "/6",
        };
      });
    const alertas = filtrados
      .map(([k, perfil]) => [k, perfil, alertasEstudiante(perfil)])
      .filter((x) => x[2].length)
      .map((x) => ((x[3] = suma(x[2].map((a) => (a[0] === "j" ? 2 : 1)))), x))
      .sort((a, b) => b[3] - a[3] || byName(a[1], b[1]));
    const dificultad = dificultadEvaluacion(perfiles);
    const CRITERIOS_ORDEN = {
      name: (perfil) => normalizar(perfil.name),
      grade: (perfil) => +perfil.grade,
      nota: notaFinal,
      avance: avanceLeccion,
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
        `<th scope=col aria-sort=${activo ? (ordenDocente.d > 0 ? "ascending" : "descending") : "none"}>` +
        `<button class=sortb data-a=dsort data-i=${clave}>${etiqueta}<span class=sortb__i aria-hidden=true>` +
        (activo ? (ordenDocente.d > 0 ? "▲" : "▼") : "⇅") +
        `</span></button></th>`
      );
    };
    /** Tarjeta de indicador (KPI) con cifra y texto. */
    const kpi = (cifra, texto) => `<div><strong>${cifra}</strong><span>${texto}</span></div>`;
    return (
      `<main><button class="b2 back" data-a=home>← Inicio</button>` +
      `<div class=sh><div><p class=ey>Panel docente · Nube</p>` +
      `<h1>Seguimiento de estudiantes</h1><p class=mut>Lección «${LECCION.t}»: notas, avance y recursos compartidos entre tus dispositivos.</p>` +
      `</div><div><button class=btn data-a=rep>⬇ Informe HTML</button>` +
      `<button class=b2 data-a=csv>⬇ Excel (CSV)</button><button class=b2 data-a=logout>Cerrar sesión</button></div></div>` +
      (issuedCode
        ? `<div class=code-box role=status><div><strong>Código personal de ${escaparHTML(issuedCodeName || "estudiante")}</strong>` +
          `<p>Compártelo de forma privada; permite acceder a ese perfil.</p><code>${escaparHTML(issuedCode)}</code></div>` +
          `<button class=b2 data-a=copy-code>Copiar código</button></div>`
        : "") +
      `<section class="card dfil" aria-label="Filtros del tablero"><div class=seg role=group aria-label="Filtrar por grado">` +
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
      `</div><label class=dfil__q>Buscar por nombre<input id=dsq type=search value="${escaparHTML(filtroDocente.q)}" placeholder="Escribe un nombre…" autocomplete=off>` +
      `</label><p class="mut dfil__n">Mostrando <strong>${total}</strong> de ${todos.length} estudiantes` +
      (filtroDocente.g ? " · grado " + filtroDocente.g + "°" : "") +
      (busqueda ? ` · búsqueda “${escaparHTML(filtroDocente.q.trim())}”` : "") +
      `. Los indicadores y gráficos responden a este filtro.</p></section>` +
      `<div class=tl>` +
      kpi(total, "estudiantes" + (total !== todos.length ? " (de " + todos.length + ")" : "")) +
      kpi(formatoNota(promedio(notas)), "promedio" + (notas.length < total ? " · " + notas.length + " con nota" : "")) +
      kpi(porcentaje(terminaron, total) + "%", `terminó la lección · ${terminaron} de ${total}`) +
      kpi(cuenta("curso"), "en curso") +
      kpi(cuenta("sin"), "sin empezar") +
      kpi(total ? (suma(perfiles.map(totalPistas)) / total).toFixed(1) : "–", "pistas promedio por estudiante") +
      kpi(suma(perfiles.map(omitidas)), "actividades omitidas") +
      `<div class=tl__dist><span>Distribución por nivel</span>` +
      `<span class=stk role=img aria-label="Distribución por nivel: ` +
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
            ? `<i class=${clase} style="flex:${distribucion[etiqueta]}" title="${etiqueta === "sin" ? "Sin nota" : etiqueta}: ${distribucion[etiqueta]}"></i>`
            : "",
        )
        .join("") +
      `</span><span class=stk__lg aria-hidden=true>` +
      NIVELES.map((etiqueta) => `<b class="nv ${CLASE_NIVEL[etiqueta]}">${etiqueta} ${distribucion[etiqueta]}</b>`).join("") +
      (distribucion.sin ? `<b class=nv>Sin nota ${distribucion.sin}</b>` : "") +
      `</span></div></div>` +
      `<div class=dg><section class="card chart-card"><h2>Distribución por nivel</h2>` +
      `<p class=mut>Estudiantes según su nota final.</p>${barrasVerticales(distribucion)}</section>` +
      `<section class="card chart-card"><h2>Promedio por actividad</h2>` +
      `<p class=mut>Escala 1.0–5.0 entre quienes ya resolvieron cada actividad; color según el nivel.</p>${barrasHorizontales(seriesActividad)}</section>` +
      `<section class="card chart-card"><h2>Comparación 10° vs 11°</h2><p class=mut>Promedio de cada actividad y de la nota final, por grado.</p>` +
      graficoBarrasSVG(
        gruposGrado,
        seriesGrado,
        "cg",
        "Promedio por actividad y grado",
        seriesGrado.map((serie) => `Grado ${serie.g}°: ` + serie.v.map((x, k) => `${gruposGrado[k]} ${formatoNota(x)}`).join(", ")).join(". "),
      ) +
      `<p class=cleg>` +
      grados.map((g) => `<span><i class=c${g}></i>Grado ${g}°</span>`).join("") +
      `</p></section>` +
      `<section class="card chart-card"><h2>Alertas <span class=pill>${alertas.length}</span></h2>` +
      `<p class=mut>Nivel Bajo o Básico, muchas pistas, omisiones, lección en curso o sin avance.</p>` +
      (alertas.length
        ? `<ul class=al>` +
          alertas
            .map(
              ([k, perfil, a, gravedad]) =>
                `<li class="${gravedad >= 2 && a.some((x) => x[0] === "j") ? "is-j" : ""}">` +
                `<div><strong>${escaparHTML(perfil.name)}</strong> <span class=pill>${perfil.grade}°</span><div class=al__t>` +
                a.map(([clase, texto]) => `<span class="nv ${clase}">${escaparHTML(texto)}</span>`).join("") +
                `</div></div><button class=b2 data-a=dsel data-i="${escaparHTML(k)}" aria-label="Ver detalle de ${escaparHTML(perfil.name)}">Ver detalle</button></li>`,
            )
            .join("") +
          `</ul>`
        : `<p class=al-ok>Sin alertas: ningún estudiante requiere atención especial con los filtros actuales.</p>`) +
      `</section></div>` +
      `<div class=dg><section class=card><h2>Avance de cada estudiante</h2>` +
      `<p class=mut>La barra muestra el paso alcanzado (dorada/violeta en curso; con el color del nivel al terminar) y la cifra, la nota final. Toca un nombre para ver su detalle.</p>` +
      barrasAvance(avanceEstudiantes) +
      `</section><section class=card><h2>Preguntas de la evaluación que más se fallan</h2>` +
      `<p class=mut>Porcentaje de estudiantes que se equivocó al menos una vez (entre quienes la respondieron).</p>` +
      barrasPorcentaje(
        dificultad.map((fila) => ({
          l: `${fila.i + 1}. ${fila.tema}`,
          pct: fila.pct,
          t: `${escaparHTML(fila.p)} · ${fila.err} de ${fila.n} con error`,
          x: fila.n ? `${fila.err}/${fila.n}` : "sin datos",
        })),
      ) +
      `</section></div>` +
      (estudianteSeleccionado ? detalleEstudiante(estudianteSeleccionado, mapa[estudianteSeleccionado]) : "") +
      `<section class=card><h2>Estudiantes</h2><p class=mut>Ordena con los encabezados. Haz clic en una fila o en «Ver detalle» para abrir el detalle del estudiante.</p>` +
      `<div class=leg><span class="nv s">Superior 4.6–5.0</span><span class="nv a">Alto 4.0–4.5</span>` +
      `<span class="nv b">Básico 3.0–3.9</span><span class="nv j">Bajo 1.0–2.9</span></div>` +
      `<div class=tw><table class=dt><caption class=sr>Seguimiento de estudiantes</caption>` +
      `<tr>${encabezadoOrden("name", "Estudiante")}${encabezadoOrden("grade", "Grado")}${encabezadoOrden("avance", "Avance")}` +
      ACTIVIDADES_CORTAS.map((a, k) => `<th scope=col title="${NOMBRES_ACTIVIDADES[k]}">${a}</th>`).join("") +
      `${encabezadoOrden("nota", "Final")}<th scope=col>Acciones</th></tr>` +
      (filas
        .map(([k, perfil]) => {
          const leccion = leccionDe(perfil);
          const g = notaFinal(perfil);
          const nombreEsc = escaparHTML(perfil.name);
          const claveEsc = escaparHTML(k);
          return (
            `<tr class="dt__row${estudianteSeleccionado === k ? " is-sel" : ""}" data-a=dsel data-i="${claveEsc}">` +
            `<td><span class=nm>${nombreEsc}</span></td><td><span class=pill>${perfil.grade}°</span></td>` +
            `<td class=dt__avance>${barraProgreso(avanceLeccion(perfil) * 100, "Avance de " + nombreEsc)}<small class=mut>${textoAvance(perfil)}</small></td>` +
            [0, 1, 2, 3]
              .map(
                (j) =>
                  `<td>` +
                  (!leccion ? "–" : leccion.sk[j] ? "<span class=om-t>Omit.</span>" : typeof leccion.sc[j] === "number" ? chipNota(leccion.sc[j]) : "–") +
                  `</td>`,
              )
              .join("") +
            `<td>${g == null ? "–" : chipNota(g) + (typeof leccion.ov === "number" ? "✎<span class=sr> (nota ajustada)</span>" : "")}</td>` +
            `<td class=dt__acts><button class=b2 data-a=dsel data-i="${claveEsc}" aria-label="Ver detalle de ${nombreEsc}">Ver detalle</button>` +
            `<button class=b2 data-a=repstu data-i="${claveEsc}" aria-label="Descargar reporte de ${nombreEsc}">Reporte</button>` +
            `<button class=b2 data-a=tedit data-i="${claveEsc}" aria-label="Editar a ${nombreEsc}">Editar</button>` +
            `<button class=b2 data-a=adj data-i="${claveEsc}" aria-label="Ajustar nota de ${nombreEsc}">Ajustar nota</button>` +
            `<button class=b2 data-a=drm data-i="${claveEsc}" aria-label="Quitar a ${nombreEsc}">Quitar</button>` +
            (estado.teacherCodes[k]
              ? `<button class=b2 data-a=show-teacher-code data-i="${claveEsc}" aria-label="Ver código personal de ${nombreEsc}">Ver código</button>`
              : "") +
            `</td></tr>`
          );
        })
        .join("") ||
        `<tr><td colspan=10>` +
          (todos.length ? "Ningún estudiante coincide con el filtro." : "Aún no hay estudiantes. Registra al grupo o migra perfiles locales desde el inicio.") +
          `</td></tr>`) +
      `</table></div></section>` +
      `<section class=card><h2>Registrar estudiante</h2><div class=reg><label>Nombre<input id=sn maxlength=120 autocomplete=off>` +
      `</label><label>Grado<select id=sg><option value=10>10°</option><option value=11>11°</option></select></label>` +
      `<button class=btn data-a=dadd>Registrar</button></div></section>${vistaRecursosDocente()}` +
      `<section class=card><h2>Datos de estudiantes</h2><p class=mut>Los cambios se guardan en el servicio compartido de ${BRAND}.</p>` +
      `<button class="b2 b2--danger" data-a=wall>🗑 Borrar todos los datos</button></section></main>`
    );
  },
};
/* ---------- 10b. CRÉDITOS: ESCENARIO «EL EQUIPO» (retratos con zoom tipo cámara) ---------- */
/** Autores del OVA en orden fijo: nombre completo, nombre corto y retrato (800×1000). */
const AUTORES = [
  { nombre: "Juan Parra", corto: "Juan", foto: "assets/autor-juan.webp" },
  { nombre: "Ana Vega", corto: "Ana", foto: "assets/autor-ana.webp" },
  { nombre: "Alejandro Ciro", corto: "Alejandro", foto: "assets/autor-alejandro.webp" },
];
/** Nombre del grupo de autores. */
const GRUPO_AUTORES = "P.V.C Education";
/** Línea que acompaña el nombre en la placa del enfoque. */
const ROL_AUTOR = "Autor · Licenciatura en Informática y Medios Audiovisuales";
/** Duraciones (ms) del recorrido: vista general, enfoque de cada autor y paso del reloj interno. */
const DURACION_GENERAL = 4000;
const DURACION_ENFOQUE = 3200;
const PASO_RECORRIDO = 200;
/** Escala máxima del «zoom» y punto del retrato (fracción de su alto) que queda centrado. */
const ESCALA_ENFOQUE = 1.9;
const ALTURA_ROSTRO = 0.42;
/**
 * Estado del escenario: foco (-1 = vista general), pausa pedida por el usuario,
 * pausas temporales (puntero encima / foco dentro), tiempo acumulado e id del intervalo.
 */
const recorridoEquipo = { foco: -1, pausaUsuario: false, sobre: false, dentro: false, transcurrido: 0, intervalo: 0 };
/** Indica si el usuario pidió reducir el movimiento. */
const movimientoReducido = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
/** HTML del escenario «El equipo»: retratos en arco, placas del enfoque, controles y enlace de descarga. */
const htmlEquipo = () => {
  const personas = AUTORES.map(
    (a, i) =>
      `<li class=equipo__persona data-persona=${i}><button class=equipo__arco data-a=equipo data-i=${i} aria-pressed=false>` +
      `<img src="${a.foto}" width=800 height=1000 alt="${a.nombre}" decoding=async></button>` +
      `<span class=equipo__corto aria-hidden=true>${a.corto}</span></li>`,
  ).join("");
  const placas = AUTORES.map(
    (a, i) =>
      `<div class=equipo__placa data-persona=${i}><p class=equipo__placa-nombre>${a.nombre}</p>` +
      `<p class=equipo__placa-rol>${ROL_AUTOR}</p></div>`,
  ).join("");
  const botones =
    `<button class="b2 equipo__boton" data-a=equipo data-i=-1 aria-pressed=true>Equipo</button>` +
    AUTORES.map(
      (a, i) => `<button class="b2 equipo__boton" data-a=equipo data-i=${i} aria-pressed=false>${a.nombre}</button>`,
    ).join("");
  return (
    `<section class=equipo id=equipo aria-labelledby=cr-equipo><h2 id=cr-equipo class=sr>El equipo</h2>` +
    `<div class=equipo__lienzo><div class=equipo__cabecera><p class=equipo__sobre>Autores del OVA</p>` +
    `<p class=equipo__grupo>${GRUPO_AUTORES}</p></div><ul class=equipo__fila>${personas}</ul></div>` +
    `<div class=equipo__placas aria-hidden=true>${placas}</div></section>` +
    `<div class=equipo__controles id=equipo-controles>` +
    `<div class=equipo__botones role=group aria-label="Enfocar a una persona del equipo">${botones}</div>` +
    `<button class="b2 equipo__pausa" data-a=equipoPausa>Pausar recorrido</button>` +
    `<a class=equipo__descarga href="assets/equipo-pvc.webp" download="equipo-pvc.webp">Descargar foto del equipo</a></div>`
  );
};
/** Calcula el transform del lienzo que centra y agranda el arco i, como una cámara que acerca. */
const transformacionEnfoque = (escenario, lienzo, i) => {
  const arco = lienzo.querySelectorAll(".equipo__arco")[i];
  if (!arco) return "";
  let x = 0;
  let y = 0;
  // offsetLeft/offsetTop ignoran transformaciones: medidas estables aunque el lienzo ya esté ampliado
  for (let el = arco; el && el !== lienzo; el = el.offsetParent) {
    x += el.offsetLeft;
    y += el.offsetTop;
  }
  const ancho = escenario.clientWidth;
  const alto = escenario.clientHeight;
  const escala = Math.min(ESCALA_ENFOQUE, (alto * 0.9) / arco.offsetHeight);
  const tx = ancho / 2 - escala * (x + arco.offsetWidth / 2);
  const ty = alto * 0.4 - escala * (y + arco.offsetHeight * ALTURA_ROSTRO);
  return `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${escala.toFixed(3)})`;
};
/** Pinta el estado actual del escenario: zoom, atenuado, placa visible y aria-pressed de los controles. */
const aplicarEnfoqueEquipo = () => {
  const escenario = $("#equipo");
  if (!escenario) return;
  const foco = recorridoEquipo.foco;
  const lienzo = escenario.querySelector(".equipo__lienzo");
  escenario.classList.toggle("is-enfocado", foco >= 0);
  lienzo.style.transform = foco >= 0 && !movimientoReducido() ? transformacionEnfoque(escenario, lienzo, foco) : "";
  escenario.querySelectorAll(".equipo__persona").forEach((p, i) => p.classList.toggle("is-foco", i === foco));
  escenario.querySelectorAll(".equipo__placa").forEach((p, i) => p.classList.toggle("is-visible", i === foco));
  document
    .querySelectorAll("#equipo [data-a=equipo], #equipo-controles [data-a=equipo]")
    .forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.i) === foco)));
};
/** Actualiza el texto del botón Pausar/Reanudar según la pausa pedida por el usuario. */
const actualizarBotonPausa = () => {
  const boton = $(".equipo__pausa");
  if (boton) boton.textContent = recorridoEquipo.pausaUsuario ? "Reanudar recorrido" : "Pausar recorrido";
};
/** Enfoca a la persona i (-1 = vista general); si lo pidió el usuario, lo anuncia al lector de pantalla. */
const enfocarEquipo = (i, delUsuario) => {
  recorridoEquipo.foco = i >= 0 && i < AUTORES.length ? i : -1;
  recorridoEquipo.transcurrido = 0;
  aplicarEnfoqueEquipo();
  if (delUsuario)
    announce(
      recorridoEquipo.foco >= 0 ? "Enfocado: " + AUTORES[recorridoEquipo.foco].nombre : "Vista del equipo completo",
    );
};
/** Detiene el reloj del recorrido (al re-renderizar o salir de Créditos: no quedan intervalos huérfanos). */
const detenerRecorridoEquipo = () => {
  clearInterval(recorridoEquipo.intervalo);
  recorridoEquipo.intervalo = 0;
};
/** Paso del reloj: suma tiempo solo si nada pausa el recorrido y avanza a la siguiente parada al cumplirse. */
const pasoRecorridoEquipo = () => {
  if (vistaActual !== "creditos" || !$("#equipo")) return detenerRecorridoEquipo();
  const r = recorridoEquipo;
  if (r.pausaUsuario || r.sobre || r.dentro || document.hidden) return;
  r.transcurrido += PASO_RECORRIDO;
  if (r.transcurrido < (r.foco < 0 ? DURACION_GENERAL : DURACION_ENFOQUE)) return;
  enfocarEquipo(r.foco >= AUTORES.length - 1 ? -1 : r.foco + 1, false);
};
/** Prepara el escenario recién dibujado: estado inicial, pausas por puntero/foco, Escape y reloj del recorrido. */
const montarEquipo = (vistaNueva) => {
  const escenario = $("#equipo");
  const controles = $("#equipo-controles");
  if (!escenario) return;
  if (vistaNueva) Object.assign(recorridoEquipo, { foco: -1, pausaUsuario: false, transcurrido: 0 });
  recorridoEquipo.sobre = false;
  recorridoEquipo.dentro = false;
  // Los listeners viven en elementos que se recrean en cada render: no se duplican
  escenario.addEventListener("pointerenter", () => (recorridoEquipo.sobre = true));
  escenario.addEventListener("pointerleave", () => (recorridoEquipo.sobre = false));
  escenario.addEventListener("focusin", () => (recorridoEquipo.dentro = true));
  escenario.addEventListener("focusout", (e) => {
    if (!escenario.contains(e.relatedTarget)) recorridoEquipo.dentro = false;
  });
  /** Escape devuelve a la vista general del equipo. */
  const alPulsarTecla = (e) => {
    if (e.key === "Escape" && recorridoEquipo.foco >= 0) enfocarEquipo(-1, true);
  };
  escenario.addEventListener("keydown", alPulsarTecla);
  if (controles) controles.addEventListener("keydown", alPulsarTecla);
  aplicarEnfoqueEquipo();
  const pausa = $(".equipo__pausa");
  // Movimiento reducido: sin recorrido automático (ni botón de pausa, porque nada se mueve solo)
  if (movimientoReducido()) {
    if (pausa) pausa.hidden = true;
    return;
  }
  actualizarBotonPausa();
  recorridoEquipo.intervalo = setInterval(pasoRecorridoEquipo, PASO_RECORRIDO);
};
// Al cambiar el tamaño de la ventana se recalcula el zoom (un único listener para toda la app)
addEventListener("resize", () => {
  if (vistaActual === "creditos" && recorridoEquipo.foco >= 0) aplicarEnfoqueEquipo();
});
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
  detenerRecorridoEquipo();
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
    (vistaActual === "unit" && leccionDe(usuario)
      ? leccionDe(usuario).step + "." + (leccionDe(usuario).a.o || 0) + "." + leccionDe(usuario).done
      : "") +
    "|" +
    viendoTeoria;
  const esNuevaVista = claveVista !== ultimaVista;
  ultimaVista = claveVista;
  if (vistaActual === "creditos") montarEquipo(esNuevaVista);
  if (principal && esNuevaVista) {
    principal.classList.add("enter");
    principal.querySelectorAll("[data-count]").forEach(countUp);
  }
  const titulo = $("#app h1");
  if (titulo) titulo.tabIndex = -1;
  document.title =
    vistaActual === "cover"
      ? BRAND + " · " + LECCION.t
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
  /** Ajusta (o quita el ajuste de) la nota final de un estudiante que terminó la lección. */
  adj: (clave) => {
    const perfil = teacherMap()[clave];
    if (!perfil) return;
    const leccion = leccionDe(perfil);
    if (!leccion || !leccion.done) {
      dialogo(escaparHTML(perfil.name) + " aún no termina la lección: todavía no hay nota que ajustar.", null);
      return;
    }
    dialogo(
      "Nota calculada de " +
        escaparHTML(perfil.name) +
        ": " +
        notaCalculada(leccion).toFixed(1) +
        ". Escribe la nueva nota (1.0–5.0) o deja el campo vacío para quitar el ajuste:",
      async (valor) => {
        if (String(valor).trim() === "") delete leccion.ov;
        else {
          const nota = parseFloat(String(valor).replace(",", "."));
          if (!(nota >= 1 && nota <= 5)) {
            dialogo("Nota no válida: debe estar entre 1.0 y 5.0.", null);
            return;
          }
          leccion.ov = redondear1(nota);
        }
        if (await updateTeacherStudent(clave, perfil)) render();
      },
      "text",
      typeof leccion.ov === "number" ? String(leccion.ov) : "",
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
    descargar("sophialap-informe-logica.html", informeGrupal(Object.values(teacherMap())), "text/html");
    announce("Informe del grupo descargado.");
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
  /** Descarga las notas de la lección en CSV (separado por «;», decimales con coma) para Excel. */
  csv: () => {
    /** Nota con coma decimal (vacía si no hay). */
    const conComa = (nota) => (typeof nota === "number" ? nota.toFixed(1).replace(".", ",") : "");
    const filas = [
      [
        "Nombre",
        "Grado",
        "Estado",
        ...NOMBRES_ACTIVIDADES.map((n, k) => `${ACTIVIDADES_CORTAS[k]} ${n} (${PESOS[k] * 100} %)`),
        "Nota final",
        "Nivel",
        "Nota ajustada",
        "Pistas",
        "Errores",
        "Omitidas",
        "Reflexión del cierre",
      ],
    ];
    Object.values(teacherMap())
      .sort((a, b) => normalizar(a.name).localeCompare(normalizar(b.name)))
      .forEach((perfil) => {
        const leccion = leccionDe(perfil);
        const nota = notaFinal(perfil);
        filas.push([
          perfil.name,
          perfil.grade + "°",
          textoAvance(perfil),
          ...[0, 1, 2, 3].map((k) => (!leccion ? "" : leccion.sk[k] ? "Omitida (1,0)" : conComa(leccion.sc[k]))),
          conComa(nota),
          nota == null ? "" : nivel(nota),
          leccion && typeof leccion.ov === "number" ? "Sí (calculada " + conComa(notaCalculada(leccion)) + ")" : "No",
          totalPistas(perfil),
          totalErrores(perfil),
          omitidas(perfil),
          leccion ? (leccion.a.r || "").trim() : "",
        ]);
      });
    descargar(
      "sophialap-notas-logica.csv",
      "﻿" + filas.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(";")).join("\r\n"),
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
  /** Marca un recurso como «sin cuenta» (1) o «pide cuenta» (2). data-i = "índice,marca". */
  ra: (valor) => {
    const [indiceRecurso, marca] = valor.split(",");
    const entrada = recursosLeccion()[+indiceRecurso];
    if (!entrada) return;
    const marcaRecurso = estado.rs[entrada[0][2]] || (estado.rs[entrada[0][2]] = {});
    marcaRecurso.a = +marca;
    persist();
    updateTeacherSettings();
    render();
  },
  /** Oculta o muestra un recurso a los estudiantes. */
  rh: (indiceRecurso) => {
    const entrada = recursosLeccion()[+indiceRecurso];
    if (!entrada) return;
    const marcaRecurso = estado.rs[entrada[0][2]] || (estado.rs[entrada[0][2]] = {});
    marcaRecurso.h = marcaRecurso.h ? 0 : 1;
    persist();
    updateTeacherSettings();
    render();
  },
  /** Quita un recurso agregado por el docente. */
  rd: (indiceRecurso) => {
    const entrada = recursosLeccion()[+indiceRecurso];
    if (entrada && entrada[1]) {
      estado.ex[CLAVE_RECURSOS_EXTRA].splice(entrada[2], 1);
      persist();
      updateTeacherSettings();
      render();
    }
  },
  /** Agrega un recurso propio a la lección. */
  radd: () => {
    const titulo = $("#rt").value.trim();
    const enlace = $("#ru").value.trim();
    if (!titulo || !/^https?:\/\//.test(enlace)) {
      dialogo("Escribe un título y un enlace que empiece por http:// o https://.", null);
      return;
    }
    (estado.ex[CLAVE_RECURSOS_EXTRA] = estado.ex[CLAVE_RECURSOS_EXTRA] || []).push(["🔗", titulo, enlace]);
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
  /** Va a la pantalla «Tu lección» (o al inicio si no hay perfil activo). */
  leccion: () => {
    viendoTeoria = 0;
    irA(usuario ? "leccion" : "home");
  },
  /** Va al resultado final. */
  final: () => irA("final"),
  /** Abre los créditos y recuerda la vista de origen para volver. */
  /** Enfoca a una persona del equipo (data-i = índice) o vuelve a la vista general (-1); enfocar pausa el recorrido. */
  equipo: (i) => {
    const n = Number(i);
    if (n >= 0) {
      recorridoEquipo.pausaUsuario = true;
      actualizarBotonPausa();
    }
    enfocarEquipo(n, true);
  },
  /** Pausa o reanuda el recorrido automático del escenario del equipo. */
  equipoPausa: () => {
    recorridoEquipo.pausaUsuario = !recorridoEquipo.pausaUsuario;
    recorridoEquipo.transcurrido = 0;
    actualizarBotonPausa();
    announce(recorridoEquipo.pausaUsuario ? "Recorrido en pausa" : "Recorrido reanudado");
  },
  creditos: () => {
    if (vistaActual !== "creditos") vistaPrevia = vistaActual;
    irA("creditos");
  },
  /** Vuelve desde los créditos a la vista desde la que se abrieron. */
  volver: () => irA(vistaPrevia && vistaPrevia !== "creditos" && (usuario || !["leccion", "unit", "final"].includes(vistaPrevia)) ? vistaPrevia : "cover"),
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
      irA("leccion");
    } catch (e) {
      accessBusy = false;
      mensajeError = e.message;
      setSync(navigator.onLine ? "error" : "offline", e.message);
      render();
    }
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
    irA("leccion");
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
    irA("leccion");
  },
  /** Borra todos los perfiles de este dispositivo (con confirmación). */
  wipe: () =>
    dialogo("¿Borrar todos los perfiles de este dispositivo?", () => {
      estado.p = {};
      olvidarCodigoMostrado();
      save();
      render();
    }),
  /** Abre la lección en el paso guardado (si ya terminó, abre el repaso de la teoría). */
  empezar: () => {
    progresoLeccion();
    estadoOrdenar = null;
    viendoTeoria = 0;
    save();
    irA("unit");
  },
  /** Califica la actividad del paso actual (pasos 1–4) y avanza al siguiente. */
  nx: () => {
    const progreso = progresoLeccion();
    if (progreso.step >= 1 && progreso.step <= 4) progreso.sc[progreso.step - 1] = puntajeActividad(progreso, progreso.step - 1);
    progreso.step = Math.min(PASO_CIERRE, progreso.step + 1);
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
  /** Omite la actividad actual (vale 1.0) tras confirmar. */
  om: () => {
    const progreso = progresoLeccion();
    const k = progreso.step - 1;
    if (!(k >= 0 && k < 4)) return;
    dialogo(
      "¿Omitir «" + NOMBRES_ACTIVIDADES[k] + "»? Vale " + PESOS[k] * 100 + "% de la nota y quedará en 1.0.",
      () => {
        progreso.sc[k] = 1;
        progreso.sk[k] = 1;
        progreso.step = Math.min(PASO_CIERRE, progreso.step + 1);
        estadoOrdenar = null;
        retroalimentacion = null;
        save();
        focoPendiente = SELECTOR_TITULO_TARJETA;
        render();
        scrollTo(0, 0);
      },
    );
  },
  /** Coloca un bloque en la actividad de ordenar. */
  dp: (indice) => {
    estadoOrdenar.sl.push(+indice);
    estadoOrdenar.pool = estadoOrdenar.pool.filter((x) => x !== +indice);
    retroalimentacion = null;
    focoPendiente = '[data-a=dr][data-i="' + indice + '"]';
    announce("Colocado en la posición " + estadoOrdenar.sl.length + (estadoOrdenar.pool.length ? "" : ". Ya puedes pulsar Comprobar."));
    render();
  },
  /** Devuelve un bloque colocado a la lista. */
  dr: (indice) => {
    estadoOrdenar.sl = estadoOrdenar.sl.filter((x) => x !== +indice);
    estadoOrdenar.pool.push(+indice);
    retroalimentacion = null;
    focoPendiente = '[data-a=dp][data-i="' + indice + '"]';
    announce("Devuelto a la lista.");
    render();
  },
  /** Comprueba el orden de la ronda: si es correcto pasa a la siguiente ronda (o califica A1); si no, suma error y pista. */
  dc: () => {
    const progreso = progresoLeccion();
    const ronda = Math.min(RONDAS_ORDENAR.length - 1, +progreso.a.o || 0);
    const grupos = RONDAS_ORDENAR[ronda].g;
    const primerError = estadoOrdenar.sl.findIndex((x, i) => grupos[x] !== grupos[i]);
    if (primerError < 0) {
      lanzarConfeti();
      progreso.a.o = ronda + 1;
      if (progreso.a.o >= RONDAS_ORDENAR.length) {
        acciones.nx();
        return;
      }
      estadoOrdenar = null;
      retroalimentacion = {
        t: "¡Correcto! Superaste la ronda " + (ronda + 1),
        x: "Ahora un razonamiento más largo: " + RONDAS_ORDENAR[ronda + 1].n.split("· ")[1].toLowerCase() + ".",
        k: "ok",
      };
      save();
      focoPendiente = "#fbk";
      announce(retroalimentacion.t + ". " + retroalimentacion.x);
      render();
      return;
    }
    const fallidas = progreso.a.op || (progreso.a.op = RONDAS_ORDENAR.map(() => 0));
    fallidas[ronda]++;
    progreso.e[0]++;
    progreso.h[0]++;
    save();
    const nivelPista = fallidas[ronda] - 1;
    retroalimentacion = {
      t: "💡 Pista " + Math.min(6, nivelPista + 1) + " de 6 · revisa la posición " + (primerError + 1),
      x: pistaOrdenar(ronda, nivelPista),
      k: "bad",
    };
    focoPendiente = "#fbk";
    announce(retroalimentacion.t + ". " + retroalimentacion.x);
    render();
  },
  /** Responde una pregunta de A2, A3 o de la evaluación. */
  ck: (seleccion) => {
    const paso = progresoLeccion().step;
    if (ACTIVIDADES[paso]) responderPregunta(seleccion, paso);
  },
  /** Termina la lección: la marca como terminada, guarda la fecha y muestra el resultado final con confeti. */
  fin: () => {
    const progreso = progresoLeccion();
    for (let k = 0; k < 4; k++) if (typeof progreso.sc[k] !== "number") progreso.sc[k] = 1;
    progreso.done = 1;
    progreso.fin = new Date().toISOString();
    save();
    lanzarConfeti();
    irA("final");
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
// Escritura: formulario del inicio y reflexión del cierre (se guarda al escribir y actualiza su contador)
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "nm") nombreFormulario = t.value;
  if (t.id === "gr") gradoFormulario = t.value;
  if (t.id === "tr" && usuario) {
    progresoLeccion().a.r = t.value.slice(0, 2000);
    save();
    const contador = $("#cnt-tr");
    if (contador) {
      const largo = t.value.length;
      const minimo = +contador.dataset.min;
      contador.classList.toggle("is-ok", largo >= minimo);
      contador.querySelector(".count__n").textContent = largo + " / " + minimo + " caracteres";
      contador.querySelector(".count__saved").classList.toggle("on", largo > 0);
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
/** Prepara la vista inicial: con la portada estática solo ajusta el tamaño de texto y la cabecera; si no, dibuja la vista. */
const iniciarVista = () => {
  const cabeceraEstatica = $("#app header.top");
  if (vistaActual === "cover" && $("#app main.cover") && cabeceraEstatica) {
    document.documentElement.style.setProperty("--u", estado.u);
    cabeceraEstatica.outerHTML = cabecera();
    ultimaVista = "cover||0";
  } else render();
};
iniciarVista();
// Arranque: comprueba si existe el servidor de sincronización; si no, la app trabaja solo en local.
api("/api/sofia/auth/session", { method: "GET" })
  .catch(() => {})
  .finally(() => {
    if (LOCAL_ONLY) {
      setSync("local", "");
      if (vistaActual === "home" || vistaActual === "login") render();
    } else migrateLocalProfiles();
  });