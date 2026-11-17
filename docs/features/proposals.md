# Propuestas (Sales)

> Status: construido 2026-11-14. Rutas `/proposals`, `/proposals/new`, `/proposals/[id]`, `/proposals/[id]/edit` y el documento en `/p/[id]`.
> Origen: `docs/sales/ESPEC_Modulo_Propuestas_Waxxor v3.md` y las tres plantillas HTML aprobadas en `docs/sales/`.
> Reemplaza al módulo `Quotes` (tablas `quotes`/`quote_items`, eliminadas en `drizzle/0042_drop_quotes.sql`) y cierra **OQ-17**: las cotizaciones se adoptan dentro de Sales. El PRD (§10) dejaba ventas fuera del MVP; esta es una ampliación de alcance decidida por el dueño del producto.

## 1. Qué es

Propuestas comerciales de **una página carta**, una plantilla por producto, con folio consecutivo al emitir y documento inmutable. Productos: SentinelOne Singularity, MSP360 + Wasabi y Microsoft 365.

## 2. Reglas que se respetan tal cual de la especificación

- **Dinero en centavos enteros.** Los totales se recalculan siempre en el servidor (`lib/proposals/calc.ts`); lo que muestra el formulario nunca se persiste.
- **Totales por recurrencia, sin gran total.** Una columna por tipo de pago — **pago único, mensualidad y anualidad** — y solo aparecen las que tienen partidas (una partida "No Incluido" también abre su columna). Son unidades distintas: nunca se suman ni se convierten entre sí, y el IVA se redondea por columna. La recurrencia de cada partida es explícita, nunca deducida del texto de vigencia.
- **Folio solo al emitir**: `WX-2026-0001`, consecutivo que reinicia cada año, compartido por todos los productos. Sale de `folio_counters` con `INSERT … ON CONFLICT DO UPDATE` dentro de la transacción de emisión: dos emisiones simultáneas dan folios distintos y un fallo devuelve el número. Un folio cancelado no se reutiliza.
- **Snapshot inmutable.** Al emitir se congela en `proposals.snapshot` todo lo necesario para redibujar el documento (textos del catálogo, logotipos en base64, totales). Emitida → se dibuja desde el snapshot; borrador → desde el catálogo vigente. Cambiar el catálogo no altera lo emitido.
- **Lo emitido no se edita.** Para corregir: cancelar y clonar; el clon recuerda de dónde viene («Sustituye a…»).
- **No se rediseñó nada.** El CSS se genera desde las plantillas y los textos son literales. El PDF de cada producto se comparó contra el de su plantilla impresa desde Chrome: idénticos salvo la fecha.

## 3. Dónde se aparta de la especificación, y por qué

| La especificación pedía | Lo construido | Razón |
|---|---|---|
| Chromium en servidor (Puppeteer), PDF archivado con sha256 | **Impresión del navegador**, igual que Reportes | Decisión del dueño (2026-11-14). Consecuencia: no hay PDF archivado ni hash; lo inmutable es el snapshot, y el PDF se regenera idéntico desde él. |
| Verificación de ajuste en el servidor al emitir | En el navegador: la vista previa mide y bloquea «Emitir» | Sin Chromium el servidor no puede medir. El servidor sí impone el tope de partidas y los largos de texto. |
| Dos layouts raíz para aislar el CSS | Route handler `/p/[id]` que devuelve HTML crudo | Mismo aislamiento de Tailwind sin reestructurar la app. |
| Un solo `documento.css` | **Dos hojas** (`dense` y `standard`) | La premisa era falsa: SentinelOne usa una retícula más densa. Unirlas habría sido rediseñar una. |
| `cliente` texto libre, ids uuid, API REST, código en español | Empresa por FK opcional + `clientName`, ids seriales, server actions, código en inglés | Convenciones de Watson. Sin empresa = prospecto. |
| Tabla `propuesta_eventos` | `audit_logs` (`entityType: "proposal"`) | No duplicar la bitácora. |
| Estado `vencida` por job diario | **Derivado** de `issued` + `expiresAt` | Patrón de contratos y servicios; no depende de un cron. |
| Al menos una partida de cada recurrencia en totales duales | No se exige | Una propuesta solo de licencias es legítima. |

## 4. Microsoft 365 (no estaba en la especificación)

Sus reglas salen de su plantilla HTML y fueron aprobadas el 2026-11-14:

- Tres planes (Basic, Standard, Premium) que cambian subtítulo, capacidades y panel, **sin** comparativo.
- **Licenciamiento anual o mensual**, elegido por propuesta: define el compromiso de las licencias (su vigencia por defecto y su precio) y la redacción de los términos. **No decide en qué columna suma cada partida**: eso lo dice la vigencia de cada concepto. Una propuesta puede llevar pago único, mensualidad y anualidad a la vez, cada uno en su columna.

  > **Cambiado 2026-11-17** a pedido del dueño ("que se identifique por separado cuando sea pago único, mensual y anual, dependiendo de los conceptos"). Antes había una sola columna recurrente y, con licenciamiento anual, los conceptos mensuales se multiplicaban ×12 dentro de la anualidad, así que la mensualidad nunca se veía. La nota y los términos sugeridos se redactan según las columnas presentes; la plantilla decía que la anualidad "incluye doce meses de los servicios mensuales", lo que dejó de ser cierto.
- **Tres columnas de totales** no caben en los 120 mm de la caja de la plantilla: con tres, la caja toma el ancho completo y la nota pasa a su propio renglón encima. Con una o dos columnas el documento queda igual que la plantilla. Es la única extensión al diseño aprobado.
- **Licencias agregables** desde un catálogo: las once de la plantilla más las variantes que Microsoft comercializa. Los precios siempre se capturan a mano (dependen del compromiso, del tipo de cambio y del margen).
- **Ajuste a una hoja por niveles**: retira la firma → pasa la aceptación a los términos → oculta descripciones de licencias agregadas. Los otros dos productos no compactan: si no caben, no se emiten.

## 5. Archivos

- `src/lib/proposals/` — `types`, `money`, `calc`, `lifecycle`, `validation`, `catalog` (puros); `document` y `logos` (solo servidor); `render` y `document-css` (el documento). `logos.ts` y `document-css.ts` son **generados** desde las plantillas.
- `src/app/(app)/proposals/` — listado, formulario, detalle con vista previa, acciones.
- `src/app/p/[id]/route.ts` — el documento (`?embed=1` para el iframe, `?print=1` abre impresión).
- Pruebas: `src/lib/proposals/proposals.test.ts` (incluye los casos al centavo de §12.8 y §12.9).

## 6. Pendiente / abierto

- Las columnas `subtotal/iva/total_recurring_cents` de `proposals` quedaron **sin uso** desde la migración `0043` (aditiva para no tirar producción entre migración y deploy). Borrarlas en una migración posterior.
- El **folio no aparece impreso** en el documento: las plantillas no tienen dónde. Hoy va en el título de la página (nombre del PDF al guardar) y en la barra de pantalla. Decidir si se agrega a la franja de datos.
- Agregar un producto = una entrada en `catalog.ts` con su `maxItems` medido sobre su plantilla.
