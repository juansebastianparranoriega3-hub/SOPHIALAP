<p align="center">
  <img src="assets/logo.png" alt="Escudo de SOPHIALAP" width="140">
</p>

<h1 align="center">SOPHIALAP · Filosofía e informática global</h1>

<p align="center">
  Objeto Virtual de Aprendizaje (OVA) interactivo de filosofía para estudiantes de grados 10° y 11°.<br>
  <strong>Sitio en vivo (GitHub Pages):</strong> <a href="https://juansebastianparranoriega3-hub.github.io/SOPHIALAP/">https://juansebastianparranoriega3-hub.github.io/SOPHIALAP/</a>
</p>

---

## ¿Qué es?

SOPHIALAP recorre los cuatro periodos del año escolar de filosofía para 10° y 11°. Cada periodo trae teoría
(con recursos externos) y cinco actividades calificadas en escala 1.0–5.0, alineadas con las competencias
**crítica, dialógica y creativa** del MEN:

1. **Ordenar** pasos de un razonamiento o una línea de tiempo
2. **Verdadero o falso** razonado
3. **Reto** propio del periodo (clasificar, relacionar o elegir)
4. **Dilema** y debate escrito
5. **Creación** escrita

Las pistas bajan la nota de la actividad, omitir vale 1.0 y la nota del periodo pondera
Ordenar 15 %, V/F 15 %, Reto 20 %, Dilema 20 %, Creación 20 % y Pistas 10 %.

### Panel docente

Con usuario y contraseña, el docente accede a un **dashboard** con:

- KPIs del grupo (promedio, % que completó la ruta, periodos completados, pistas, omitidas)
- Gráficos de distribución por nivel, promedio por periodo y grado, promedio por actividad y avance por estudiante
- Alertas (nivel bajo, muchas pistas u omisiones, sin avance)
- Filtros por grado y búsqueda, tabla ordenable y detalle de cada estudiante
- **Reporte HTML individual** descargable por estudiante e informe grupal (HTML y CSV)
- Registro de estudiantes con código personal, edición, ajuste de notas y gestión de recursos

## Arquitectura

```
Navegador ──► GitHub Pages  (index.html · styles.css · app.js · assets/)
    │
    └──► Supabase (PostgreSQL) ── funciones RPC: estudiantes, notas, recursos y sesión docente
```

- **GitHub** aloja todo el código y publica el sitio con **GitHub Pages** (rama `main`, carpeta raíz).
  Cada `push` a `main` actualiza el sitio automáticamente.
- **Supabase** solo guarda los datos compartidos. Las tablas tienen RLS activado sin políticas: el
  navegador no puede leerlas directamente. Todo pasa por funciones `SECURITY DEFINER` que validan el
  código personal del estudiante o el token de sesión del docente (ver [`supabase/schema.sql`](supabase/schema.sql)).
- La clave de Supabase incluida en `app.js` es la clave **pública** (publishable), pensada para usarse en el navegador.

## Estructura

```
├── index.html                       Estructura base de la página
├── styles.css                       Estilos (índice de secciones al inicio)
├── app.js                           Lógica de la aplicación (SPA en JavaScript vanilla)
├── assets/                          Logo, favicon e ilustraciones
├── supabase/schema.sql              Tablas, seguridad y funciones RPC de la base de datos
├── docs/SOPHIALAP-documentacion.pdf Documentación: flujo, contenido y código explicado
├── .nojekyll                        Indica a GitHub Pages que publique los archivos tal cual
└── README.md
```

El frontend son **tres archivos** (HTML, CSS y JS) sin frameworks ni proceso de compilación.

## Cómo funciona el guardado

- El progreso del estudiante se guarda siempre en el navegador (`localStorage`) y se sincroniza con
  Supabase cuando hay conexión.
- Cada estudiante recibe un **código personal** (`SL-XXXX-XXXX-XXXX`) para abrir su perfil desde otro
  dispositivo. En la base de datos solo se guarda su hash SHA-256.
- La contraseña docente se guarda con bcrypt; la sesión docente es un token aleatorio que expira en 8 horas.

## Ejecutar en local

Sirve la carpeta con cualquier servidor estático (se conecta a la misma base de datos):

```bash
npx serve .
```

## Montar tu propia base de datos

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el editor SQL.
3. Crea el usuario docente (con tu propia contraseña):
   ```sql
   insert into public.teachers (username, password_hash)
   values ('docente', extensions.crypt('TU_CONTRASEÑA', extensions.gen_salt('bf', 10)));
   ```
4. Cambia `SUPABASE_URL` y `SUPABASE_KEY` al inicio de `app.js` por los de tu proyecto.

Si `SUPABASE_URL` se deja vacío, la app funciona en **modo local** (sin panel docente).

## Funciones RPC (Supabase)

| Función                    | Uso                                                |
|----------------------------|----------------------------------------------------|
| `teacher_login`            | Inicia sesión docente → token                       |
| `teacher_session`          | ¿El token sigue vigente?                           |
| `teacher_logout`           | Cierra la sesión                                   |
| `student_register`         | Registra un estudiante → código personal           |
| `student_access`           | Abre un perfil con su código personal              |
| `student_save_progress`    | Guarda el progreso (requiere el código personal)   |
| `teacher_list_students`    | Lista de estudiantes (docente)                     |
| `teacher_create_student`   | Registra un estudiante (docente)                   |
| `teacher_update_student`   | Edita nombre, grado o notas (docente)              |
| `teacher_delete_student`   | Elimina un estudiante (docente)                    |
| `teacher_get_settings` / `teacher_put_settings` | Recursos compartidos por periodo (docente) |

## Documentación

La explicación completa del flujo, el contenido y el código por secciones está en
[`docs/SOPHIALAP-documentacion.pdf`](docs/SOPHIALAP-documentacion.pdf).

## Autores

**Alejandro Ciro, Ana Vega y Juan Parra**
Fundamentos de Algoritmia · Licenciatura en Informática y Medios Audiovisuales · Universidad de Córdoba · 2026
