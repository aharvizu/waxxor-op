# Knowledge Base & Help Center

> Status: shipped 2026-07-19. Resolves I-02 (Knowledge listed as a PRD module but absent from MVP scope) with two separated spaces: **KB Operativa** (`/knowledge`) and **Centro de Ayuda** (`/help`).
> Fuera de alcance explícito: IA, chatbot, búsqueda semántica externa, portal del cliente, publicación pública, traducción automática, videos reales, LMS completo.

## Objetivo

Un solo módulo con dos audiencias distintas que comparten infraestructura (búsqueda, permisos, integración con módulos) pero no contenido: **KB Operativa** es conocimiento técnico interno (procedimientos, soluciones de tickets); **Centro de Ayuda** es documentación de cómo usar Watson mismo.

## Modelo (migración `drizzle/0020_same_steve_rogers.sql`)

- **`knowledge_categories`** — categorías planas por organización (único `(org, slug)`).
- **`knowledge_articles`** — `status` (draft/in_review/published/archived), `visibility` (internal/**client** — modelada para el futuro, ninguna consulta hoy la usa para exponer nada fuera del portal interno), contenido actual denormalizado (problem/cause/solution/steps/notes) para lectura rápida, `tags` jsonb, `currentVersion`, `authorId`/`reviewerId`/`reviewNotes`, `sourceTicketId` (origen cuando se generó desde un ticket), `anonymized`.
- **`knowledge_article_versions`** — snapshot inmutable por cada guardado (mismo patrón que `report_versions`, ver `docs/architecture/report-snapshots.md`): editar **siempre** inserta una versión nueva y bump de `currentVersion`; las versiones previas nunca se tocan.
- **`knowledge_article_relations`** — relación polimórfica (mismo patrón que `recurrenceTargetType`): un artículo puede vincularse a Ticket, Cliente, Proyecto y/o Actividad simultáneamente; `isOrigin` marca el vínculo creado por el flujo Ticket→KB.
- **`knowledge_article_favorites`** — favorito por usuario, único `(article, user)`.
- **`help_tutorials`/`help_tutorial_steps`** — **deliberadamente sin `organizationId`**: documentan el uso del producto Watson mismo, idéntico para cualquier organización (mismo razonamiento que los enums/labels del sistema — no son datos de negocio del tenant). Contenido sembrado por código (`scripts/seed-help.ts`), no editable desde la UI (spec: sin LMS completo).
- **`user_tutorial_progress`** — progreso por usuario: pasos completados, índice actual ("continuar donde quedó"), `completedAt`, `dismissedAt` ("no volver a mostrar"). Único `(user, tutorial)`.

## KB Operativa (`/knowledge`)

- **Estados**: draft → in_review → published → archived, con `in_review → draft` (cambios solicitados) y `archived → draft` (restaurar). Administrator/Director/SuperAdmin también pueden publicar directo desde borrador (ya tienen autoridad de publicación, forzar una revisión formal no añade control) — regla pura en `canTransitionArticle` (`src/lib/knowledge.ts`).
- **Autor y revisor**: `authorId` al crear; `reviewerId` se fija al solicitar cambios o, si no había uno, al publicar.
- **Versión e historial**: cada guardado de contenido crea una versión inmutable; el detalle muestra el historial completo con autor y resumen del cambio.
- **Categorías y etiquetas**: categorías propias (`knowledge_categories`, administradas en Configuración → Conocimiento); etiquetas como texto libre (jsonb) — no ameritan una tabla aparte.
- **Búsqueda y filtros**: título/problema/solución (`ilike`), categoría, estado, favoritos, etiqueta exacta.
- **Favoritos**: toggle por usuario, independiente del estado del artículo.
- **Visibilidad**: `internal`/`client` en el modelo — **ninguna pantalla expone el valor `client` fuera del portal interno todavía** (no existe portal de cliente).

## Flujo Ticket → KB

Desde la pestaña Resolution de un ticket con resolución escrita, el botón "Crear artículo de conocimiento" abre un formulario precargado con título (el del ticket), problema (`workItems.description`), solución (`tickets.resolution`) — causa/pasos/notas quedan vacíos para que el autor los complete. Reglas:

1. **Nunca se publica automáticamente** — el artículo nace `draft` sin excepción, sin importar el rol.
2. **Un ticket genera como máximo un artículo** — verificado por `sourceTicketId`, chequeado explícitamente antes de insertar (no es una constraint de BD: un ticket sin artículo es un estado válido y común).
3. **Anonimizar** (checkbox) reemplaza el nombre del cliente y el contacto (texto libre en `tickets.contact` — no hay `Contact` FK en tickets todavía) por `[cliente]`/`[contacto]`, y redacta correos/teléfonos con regex determinista — documentado como mejor esfuerzo, no NLP.
4. **Excluye notas internas, secretos y datos de cobro por construcción**: el formulario del flujo solo declara los campos problema/causa/solución/pasos/notas en su schema Zod — ningún otro campo del ticket (billing, notas internas) llega jamás a la acción.
5. **Auditado**: evento `created_from_ticket` con folio del ticket y si se anonimizó.
6. **Se muestra en el Ticket**: la misma pestaña Resolution enlaza al artículo generado con su estado, una vez creado.

## Centro de Ayuda (`/help`, `/help/[slug]`)

- **Portada** agrupada por módulo (Hoy, Actividades, Tickets, Proyectos, Clientes, Recurrentes, Reportes, Indicadores, Configuración, Inbox, Conocimiento), con indicador visual de completado/en progreso/sin empezar y búsqueda por texto.
- **Detalle del tutorial**: objetivo, checklist de pasos (con placeholder de captura — "capturas reales" está fuera de alcance), tips, errores comunes, enlace directo al módulo (`moduleHref`).
- **Checklist interactivo**: cada paso se marca/desmarca; al completar todos se marca el tutorial como terminado automáticamente.
- **Recorrido guiado**: overlay de pasos secuenciales (no tooltips anclados al DOM — decisión documentada, motor de posicionamiento fuera de alcance de este sprint), reutiliza el mismo contenido que el checklist; la posición se persiste (`setTutorialPosition`) para "continuar donde quedó".
- **"No volver a mostrar"**: marca `dismissedAt` sin exigir completar el tutorial.
- **"Marcar como completado"**: atajo que completa todos los pasos de una vez.

## Interactividad transversal

- **Botón de ayuda contextual** (`HelpMenuButton`, en el Topbar de todas las pantallas): recomienda hasta 3 tutoriales según el primer segmento de la ruta actual (`moduleForPath`), con enlace al Centro de Ayuda completo.
- **"Continuar aprendiendo"** en Hoy: tarjeta discreta que solo aparece si el usuario tiene un tutorial en progreso (`getContinueLearning`) — no satura la pantalla si no hay nada pendiente.
- **Command Palette (⌘K)**: entradas estáticas de navegación (Knowledge Base, Help Center, Inbox, Settings) + **búsqueda en vivo** (`/api/search/knowledge`, debounce 200 ms) de artículos publicados y tutoriales activos mientras se escribe.

## Permisos (reutiliza RBAC existente)

- **Consultar** artículos publicados y tutoriales: cualquier rol interno.
- **Crear borradores**: cualquier rol interno (Technician explícitamente mencionado en el spec como el "piso", no un techo — Director/Administrator/PM/SuperAdmin también pueden).
- **Revisar** (`canReview`): SuperAdmin, Administrator, Director, Project Manager.
- **Publicar/archivar/restaurar** (`canPublish`): SuperAdmin, Administrator, Director.
- **Eliminar permanentemente**: solo SuperAdmin.
- **Administrar categorías** (Configuración): SuperAdmin, Administrator, Director.
- **Activar/desactivar tutoriales** (Configuración): SuperAdmin, Administrator.
- **Client**: sin acceso — hereda el redirect de `requireUser()`.

## Integraciones

- **Tickets**: botón "Crear artículo de conocimiento" + artículo generado visible en la pestaña Resolution.
- **Cliente 360**: pestaña "Conocimiento" (17ª) con artículos relacionados vía `knowledge_article_relations`.
- **Proyectos**: tarjeta "Base de conocimiento" en Resumen con artículos relacionados.
- **Today**: tarjeta "Continuar aprendiendo".
- **Búsqueda global**: Command Palette con resultados en vivo.
- **Settings**: Configuración → Conocimiento (categorías) y Configuración → Ayuda (activar/desactivar tutoriales).

## Contenido inicial

10 tutoriales sembrados (`scripts/seed-help.ts`, idempotente por slug): usar Hoy, crear y resolver un Ticket, convertir la solución de un Ticket en KB, crear una Actividad, gestionar un Proyecto, consultar Cliente 360, crear una recurrencia, generar un Reporte, consultar Indicadores, administrar Configuración. Cada uno documenta **solo funciones ya implementadas** — verificado contra el código real, no aspiracional.

## Pruebas

- Unitarias (`src/lib/knowledge.test.ts` 17 casos + `src/lib/help.test.ts` 11 casos): máquina de estados completa, permisos por rol, reglas de edición (autor/revisor/publicador), anonimización (nombres + regex de correo/teléfono), `slugify`, límites de pasos/etiquetas, mapeo de ruta a módulo, estado de progreso.
- Integración (`scripts/verify-knowledge.ts`, **18/18 PASS** contra la BD real): creación de borrador + v1, edición bump a v2 con v1 intacta, máquina de estados (transiciones prohibidas rechazadas por la regla pura), flujo Ticket→KB (siempre borrador, relación de origen marcada, anonimización sin fuga del nombre del cliente), favoritos con índice único, relaciones resueltas por tipo (cliente/proyecto), aislamiento por organización, rollback transaccional por fallo de auditoría, tutorial sembrado con pasos ordenados, progreso único por usuario+tutorial.
- Smoke HTTP (servidor real): las 9 rutas nuevas responden 200 · ticket resuelto → botón visible → artículo simulado enlazado y mostrado en ambos lados · publicar directo desde borrador (rol elevado) auditado · archivar/restaurar auditado · edición de contenido crea v2 preservando v1 · favorito · búsqueda en vivo del Command Palette (solo devuelve artículos **publicados**, verificado explícitamente) · checklist de tutorial, marcar completado, "no volver a mostrar", tarjeta "Continuar aprendiendo" en Hoy. Datos de prueba limpiados (conteos finales en 0; los 10 tutoriales sembrados con sus 38 pasos permanecen intactos).

## Limitaciones conocidas (documentadas, no bloqueantes)

1. **Sin editor de contenido para tutoriales** — se administran por código/seed; Configuración → Ayuda solo activa/desactiva (spec: sin LMS completo).
2. **Recorrido guiado no ancla tooltips al DOM** — es un overlay secuencial de un paso a la vez, mismo contenido que el checklist.
3. **Anonimización es regex determinista, no NLP** — reemplaza el nombre exacto del cliente/contacto y patrones de correo/teléfono; no garantiza eliminar toda PII.
4. **`visibility: "client"` no tiene ningún efecto todavía** — modelado para cuando exista portal de cliente (fuera de alcance de este sprint).
5. **Capturas son placeholders de texto**, nunca imágenes reales (fuera de alcance explícito).
