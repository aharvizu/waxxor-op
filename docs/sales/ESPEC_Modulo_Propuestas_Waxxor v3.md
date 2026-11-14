# Especificación — Módulo "Propuestas" con folios

Documento de implementación para el portal Waxxor (Next.js · React · Tailwind · PostgreSQL · Puppeteer).
Pensado para entregarse a Claude Code dentro del proyecto existente.

**Versión 2** — agrega el producto **MSP360 + Wasabi** y generaliza el renderizador para soportar productos con y sin paquetes, con totales simples o duales. Los cambios respecto de la v1 están marcados como **[v2]**.

**Archivos de referencia obligatorios:**

| Producto | Plantilla aprobada | Variante de layout |
|---|---|---|
| SentinelOne Singularity | `Waxxor_Propuesta_SentinelOne_Singularity_EDITABLE.html` | `tiers` |
| MSP360 + Wasabi | `Waxxor_Propuesta_MSP360_Wasabi_EDITABLE.html` | `simple` |

Ambas contienen el CSS exacto, el logotipo en base64 y el contenido verificado. **No rediseñar.** El módulo porta esos documentos a React; no los reinventa.

---

## 1. Qué se construye

Un módulo que permite crear, numerar, emitir y archivar propuestas comerciales de una página, con la identidad visual de Waxxor ya establecida.

**Alcance:**

1. CRUD de propuestas en estado borrador.
2. Asignación de folio consecutivo al emitir.
3. Renderizado del documento de una página idéntico a la plantilla del producto elegido.
4. Generación y archivado de PDF inmutable por folio.
5. Listado con filtros y seguimiento de estado.

**Fuera de alcance en esta primera versión:** firma electrónica, envío por correo, portal del cliente.

---

## 2. Regla de arquitectura más importante

> **El documento de la propuesta NO usa Tailwind y NO comparte layout con el portal.**

El documento está maquetado en milímetros para impresión en tamaño carta. El *preflight* de Tailwind redefine `margin`, `padding`, `box-sizing`, `line-height` y los estilos de `table`, y eso rompe la retícula. Si se mezclan, el PDF sale descuadrado.

**Implementación en Next.js App Router — dos layouts raíz separados mediante grupos de rutas:**

```
app/
├── (portal)/
│   ├── layout.tsx              <- importa globals.css (Tailwind). UI del portal.
│   └── propuestas/
│       ├── page.tsx            <- listado
│       ├── nueva/page.tsx      <- formulario
│       └── [folio]/page.tsx    <- detalle, con <iframe> de vista previa
│
└── (documento)/
    ├── layout.tsx              <- NO importa globals.css. Sólo documento.css.
    └── p/[folio]/page.tsx      <- el documento, desnudo, sin chrome del portal
```

Ambos `layout.tsx` declaran su propio `<html>` y `<body>`. Next.js lo permite cuando los grupos de rutas no comparten segmento padre.

La vista previa dentro del portal se muestra con `<iframe src="/p/{folio}">`, lo que aísla el CSS por completo. Puppeteer apunta a esa misma URL. Un solo renderizador para pantalla y PDF: nunca divergen.

**El CSS del documento** se copia tal cual del `<style>` de la plantilla a `app/(documento)/documento.css`, quitando únicamente el bloque `@media screen` de la capa de edición y la `.toolbar`.
Se conservan intactos: variables `:root`, unidades en mm, `@page`, y la regla de impresión de fondos.

**[v2] Un solo `documento.css` para todos los productos.** Las dos plantillas comparten el mismo CSS base; MSP360 sólo agrega tres reglas para los totales duales (`.totals .box.dual`, `.totals .dual > .col`, `.totals .dual > .col > .hd`) y cambia el valor del token del fabricante. Copiar la unión de ambos bloques `<style>`, sin duplicar reglas. El color del fabricante deja de ser `--s1` fijo: ver sección 8.3.

---

## 3. Anatomía del documento

Bloques en orden fijo. Alto útil del cuerpo: **264.2 mm** (279 − 3 de barra superior − 11.8 de pie). Si el contenido excede, el pie se corta.

**[v2] Dos variantes de layout.** El esqueleto, el encabezado, el hero, la franja de datos, los términos, el cierre y el pie son idénticos. Cambian tres bloques:

| # | Bloque | Variante `tiers` (SentinelOne) | Variante `simple` (MSP360) |
|---|---|---|---|
| 1 | Barra tricolor | 3 mm · morado 32 % · azul 22 % · marino 46 % | igual |
| 2 | Encabezado | 16 mm · logotipo Waxxor (9.6 mm) + **un** bloque de partner | igual, con **dos** logotipos de fabricante separados por filete |
| 3 | Hero | 34 mm · degradado marino, hexágono SVG al 13 % | igual |
| 4 | Franja de datos | 11 mm · Cliente · Preparada por · Fecha · Vigencia | igual |
| 5 | Sección 01 | **3** capacidades + panel de garantía | **4** capacidades + panel de garantía |
| 6 | Sección 02 | Matriz comparativa de paquetes | **no existe**; la numeración recorre |
| 7 | Sección económica | Tabla + totales **simples** | Tabla + totales **duales** (pago único / mensualidad) |
| 8 | Términos | 15 mm · tres columnas | igual |
| 9 | Cierre | 15 mm · recuadro de aceptación + línea de firma | igual |
| 10 | Pie | 12 mm · banda marino con lema y contacto | igual |

La numeración de secciones se calcula, no se escribe a mano: `tiers` produce 01 Solución · 02 Comparativo · 03 Económica · 04 Términos; `simple` produce 01 Solución · 02 Económica · 03 Términos.

**Tokens de color** (en `:root`, ya en la plantilla):

```
--navy #241C61   --navy-deep #1A1350   --ink #221C4A
--purple #7A2BF5 --purple-soft #F4EFFF --blue #4FA3DC
--grey #4C4663   --grey-2 #6F6982      --line #E6E3F1   --soft #F8F7FC
```

**Tipografía:** Poppins 300/400/600/700, cargada con `next/font/google` en el layout del documento para que el PDF no dependa de la red.

---

## 4. Contrato de datos

```ts
/** [v2] El paquete es opcional: sólo los productos con variante `tiers` lo usan. */
type ProductoClave = 'sentinelone' | 'msp360';
type PaqueteClave  = 'core' | 'control' | 'complete';

type EstadoPropuesta =
  | 'borrador' | 'emitida' | 'aceptada'
  | 'rechazada' | 'vencida' | 'cancelada';

/** Partida de la tabla económica. */
interface Concepto {
  titulo: string;                            // máx. 120
  descripcion: string;                       // máx. 240
  cantidad: number | null;                   // null imprime "—" y multiplica por 1
  vigencia: string;                          // "Mensual" | "12 meses" | "Proyecto"
  precioUnitarioCentavos: number | null;     // null imprime "No Incluido" y NO suma

  /** [v2] A qué columna de totales suma. Obligatorio, explícito: NO se deduce
   *  del texto de `vigencia`. El documento HTML lo deduce del texto porque es
   *  editable a mano; el servidor no debe hacerlo. */
  recurrencia: 'unica' | 'mensual';
}

interface Propuesta {
  id: string;                      // uuid
  folio: string | null;            // null mientras es borrador
  serie: string;                   // 'WX'
  folioAnio: number | null;
  consecutivo: number | null;
  estado: EstadoPropuesta;

  cliente: string;
  preparadaPor: string;
  fecha: string;                   // 'YYYY-MM-DD'
  vigenciaDias: number;            // default 30

  producto: ProductoClave;
  paquete: PaqueteClave | null;    // [v2] null cuando el producto no tiene paquetes

  conceptos: Concepto[];           // mínimo 1; máximo según sección 4.2
  nota: string | null;
  ivaBps: number;                  // 1600 = 16.00 %
  moneda: 'MXN';

  /** [v2] Totales por recurrencia. Un producto de totales simples deja los
   *  campos `Mensual` en cero y el renderizador dibuja una sola barra. */
  subtotalUnicoCentavos: number;
  ivaUnicoCentavos: number;
  totalUnicoCentavos: number;
  subtotalMensualCentavos: number;
  ivaMensualCentavos: number;
  totalMensualCentavos: number;

  snapshot: SnapshotPropuesta | null;
  venceEn: string | null;
  emitidaEn: string | null;
  pdfSha256: string | null;
  pdfRuta: string | null;
}
```

**[v2] Migración desde v1.** Las columnas `subtotal_centavos`, `iva_centavos` y `total_centavos` se renombran a `*_unico_centavos` y se agregan las tres `*_mensual_centavos` con `DEFAULT 0`. Los registros existentes quedan correctos: todo lo de SentinelOne es pago único.

### 4.1 Dinero

> **Todo el dinero se almacena y se opera en centavos, como enteros.** Nunca `float`, nunca `number` con decimales.

```ts
// importe de una partida
const importe = precioUnitarioCentavos === null
  ? null                                        // "No Incluido"
  : (cantidad ?? 1) * precioUnitarioCentavos;

// [v2] totales por recurrencia
const sumar = (r: 'unica' | 'mensual') =>
  conceptos
    .filter(c => c.recurrencia === r)
    .reduce((s, c) => s + (importeDe(c) ?? 0), 0);

const subtotalUnico   = sumar('unica');
const subtotalMensual = sumar('mensual');

// El IVA se redondea POR COLUMNA, nunca sobre la suma de ambas.
const ivaUnico   = Math.round(subtotalUnico   * ivaBps / 10_000);
const ivaMensual = Math.round(subtotalMensual * ivaBps / 10_000);
```

Formateo sólo al imprimir, con `Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' })`.

Los totales se recalculan **siempre en el servidor** antes de guardar. El cliente puede mostrarlos en vivo, pero su resultado nunca se persiste.

**[v2] No existe un "gran total".** No sumar la columna única con la mensual: son unidades distintas (un pago contra un pago por mes) y sumarlas produce una cifra que no significa nada. Si alguien pide el costo del primer año, es un cálculo aparte y explícito, fuera del documento.

### 4.2 Límite de una página — **[v2] reescrito**

La v1 fijaba un máximo de 5 partidas. **Es incorrecto y hay que corregirlo.** Medido sobre las plantillas aprobadas, ambas llenan la hoja exactamente con su contenido actual: el pie queda al milímetro del borde y no hay holgura.

| Variante | Capacidades | Comparativo | Totales | Partidas que caben |
|---|---|---|---|---|
| `tiers` (SentinelOne) | 3 | sí | simples | **3** |
| `simple` (MSP360) | 4 | no | duales | **4** |

Una partida de más desborda el pie fuera de la página (medido: +2.5 mm en `tiers`, +7.3 mm en `simple`). Validar en el esquema de entrada, por variante, y mostrar el error en el formulario.

El límite real es vertical, no de renglones: una partida con descripción de dos líneas ocupa más que una de una línea. Por eso el límite duro de la tabla se acompaña de la **verificación automática de ajuste** de la sección 9.1, que es la que manda. Si un caso necesita más partidas, se divide en dos propuestas o se agrega un anexo.

---

## 5. Folios

### 5.1 Formato

```
WX-2026-0001
│  │    └── consecutivo, 4 dígitos con ceros a la izquierda
│  └─────── año de emisión
└────────── serie fija
```

El consecutivo **reinicia cada año**. La serie es configurable por si más adelante se agregan contratos (`WX-C-...`) u órdenes de servicio. **[v2] La serie no depende del producto:** MSP360 y SentinelOne comparten el mismo consecutivo.

### 5.2 Cuándo se asigna

**Sólo al emitir.** Un borrador no tiene folio. Esto evita quemar números en propuestas que nunca salen y mantiene el consecutivo sin huecos ante la contabilidad.

### 5.3 Generación atómica

Dos usuarios emitiendo al mismo tiempo no pueden recibir el mismo folio. Usar una tabla de contadores con `INSERT ... ON CONFLICT DO UPDATE`, que PostgreSQL serializa sobre la fila sin necesidad de bloqueo explícito:

```sql
CREATE TABLE folio_contadores (
  serie       text        NOT NULL,
  anio        smallint    NOT NULL,
  ultimo      integer     NOT NULL DEFAULT 0,
  actualizado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (serie, anio)
);

CREATE OR REPLACE FUNCTION siguiente_consecutivo(p_serie text, p_anio smallint)
RETURNS integer AS $$
DECLARE v_consecutivo integer;
BEGIN
  INSERT INTO folio_contadores (serie, anio, ultimo)
       VALUES (p_serie, p_anio, 1)
  ON CONFLICT (serie, anio)
  DO UPDATE SET ultimo = folio_contadores.ultimo + 1, actualizado = now()
    RETURNING ultimo INTO v_consecutivo;
  RETURN v_consecutivo;
END;
$$ LANGUAGE plpgsql;
```

La emisión completa va en **una sola transacción**: obtener consecutivo → componer folio → construir snapshot → actualizar la propuesta a `emitida`. Si algo falla, el consecutivo se revierte con el `ROLLBACK`.

Además, `folio` lleva `UNIQUE` en la tabla como red de seguridad.

### 5.4 Cancelación

Un folio cancelado **no se reutiliza**. La propuesta pasa a `cancelada` y conserva su número. Reutilizar folios rompe cualquier auditoría.

---

## 6. Ciclo de vida

```
borrador ──emitir──> emitida ──┬──> aceptada
    │                          ├──> rechazada
    │                          ├──> vencida      (job diario, vence_en < hoy)
    └──> cancelada             └──> cancelada
```

Transiciones permitidas, para validar en el servicio:

```ts
const TRANSICIONES: Record<EstadoPropuesta, EstadoPropuesta[]> = {
  borrador:  ['emitida', 'cancelada'],
  emitida:   ['aceptada', 'rechazada', 'vencida', 'cancelada'],
  aceptada:  [],
  rechazada: ['cancelada'],
  vencida:   ['aceptada', 'cancelada'],
  cancelada: [],
};
```

**Una propuesta emitida es inmutable.** Si hay que corregirla, se cancela y se clona en un borrador nuevo que tomará otro folio. El detalle debe mostrar el enlace «Sustituye a WX-2026-0014».

Cada cambio de estado se registra en `propuesta_eventos` con actor, fecha y nota.

---

## 7. Snapshot

Al emitir se congela un JSON con **todo lo necesario para redibujar el documento idéntico dentro de cinco años**, aunque después cambie el catálogo, se reescriban los textos de las capacidades o se rediseñe el logotipo.

El renderizador sigue esta regla:

> Si existe `snapshot`, dibuja desde el snapshot. Si no existe (borrador), dibuja desde el catálogo vigente.

**[v2] Contenido del snapshot, versión 2:**

```ts
interface SnapshotPropuesta {
  version: 2;
  folio: string;
  emitidaEn: string;

  producto: ProductoClave;         // [v2]
  variante: 'tiers' | 'simple';    // [v2] decide qué bloques dibuja el renderizador

  encabezado: { cliente; preparadaPor; fecha; vigencia };

  /** [v2] Uno o dos fabricantes. El base64 del logotipo se congela aquí:
   *  si mañana el fabricante cambia de imagen, la propuesta emitida no cambia. */
  partners: {
    etiqueta: string;              // "Solución de respaldo"
    logos: { alto: string; alt: string; pngBase64: string }[];  // 1 o 2
  };

  paquete: {
    clave: PaqueteClave | null;    // [v2] null en productos sin paquetes
    titulo: string;                // "Singularity™ Complete" | "MSP360 Managed Backup · Wasabi"
    subtitulo: string;
    intro: string;
    capacidades: { icono: string; titulo: string; texto: string }[];  // [v2] 3 o 4
  };

  panel: {
    etiqueta; titulo; texto;
    cifras: { numero: string; unidad: string; pie: string }[];        // 2
    letraChica: string;
  };

  /** [v2] null cuando la variante es `simple`. */
  comparativo: {
    columnas: { clave: PaqueteClave; nombre: string; etiqueta: string }[];
    filas: { capacidad: string; incluido: PaqueteClave[] }[];         // 7
  } | null;

  conceptos: Concepto[];
  nota: string;

  /** [v2] Totales por recurrencia + modo de dibujo. */
  totales: {
    modo: 'simple' | 'dual';
    unico:   { subtotalCentavos; ivaCentavos; totalCentavos };
    mensual: { subtotalCentavos; ivaCentavos; totalCentavos };
    ivaBps; moneda;
  };

  terminos: string[][];      // 3 columnas de viñetas, admite <b>
  aceptacion: string;
  pie: { lema; telefono; sitio; correo };
}
```

**[v2] Compatibilidad hacia atrás.** El renderizador debe leer `version: 1` sin convertir nada en base de datos: si `version === 1`, asumir `variante: 'tiers'`, `producto: 'sentinelone'`, `totales.modo: 'simple'` con todo en `unico`, y un solo partner con el logotipo de SentinelOne. Escribir siempre `version: 2`.

---

## 8. Catálogo de productos — **[v2] reorganizado**

Vive en código, no en base de datos (cambia con cada release, no por operación). Un módulo exporta un catálogo por producto con la forma que consume el snapshot.

```ts
interface Producto {
  clave: ProductoClave;
  nombre: string;                  // para el selector del formulario
  variante: 'tiers' | 'simple';
  colorFabricante: string;         // token --marca
  partners: SnapshotPropuesta['partners'];
  paquetes: Record<string, PaqueteCatalogo> | null;  // null si variante === 'simple'
  contenidoUnico: PaqueteCatalogo | null;            // el contenido si no hay paquetes
  panel: SnapshotPropuesta['panel'];
  comparativo: SnapshotPropuesta['comparativo'];     // null si variante === 'simple'
  conceptosSugeridos: Concepto[];                    // precargan el formulario
  terminos: string[][];
  maxPartidas: number;
}
```

### 8.1 SentinelOne Singularity — variante `tiers`

**Extraer el contenido literal del objeto `TIERS` y del bloque `ICO` de `Waxxor_Propuesta_SentinelOne_Singularity_EDITABLE.html`.** Ahí está ya redactado y verificado contra la documentación de SentinelOne:

- Títulos, intros y las 3 capacidades por paquete, con su clave de icono.
- Los 8 iconos SVG (trazo 1.6, `viewBox 24×24`, color `--purple`).
- Las 7 filas del comparativo con sus marcas por columna.
- El panel de garantía anti-ransomware, idéntico para los tres paquetes.

Claves de icono por paquete:

| Paquete | Capacidad 1 | Capacidad 2 | Capacidad 3 |
|---|---|---|---|
| core | `ia` | `rollback` | `consola` |
| control | `incluye` | `firewall` | `usb` |
| complete | `incluye` | `story` | `hunting` |

`maxPartidas: 3`.

### 8.2 MSP360 + Wasabi — variante `simple` **[v2]**

Extraer el contenido literal de `Waxxor_Propuesta_MSP360_Wasabi_EDITABLE.html`. No reescribir los textos: están redactados contra msp360.com y wasabi.com y revisados para que el panel no prometa más de lo que los fabricantes sostienen.

**Encabezado.** Etiqueta `Solución de respaldo`, seguida de dos logotipos en base64 tomados del HTML: MSP360 a `5.4mm` de alto y Wasabi a `8.6mm`, separados por el filete `.rule`. Los dos vienen con fondo transparente.

**Hero.**

- Antetítulo: `Propuesta ejecutiva · Continuidad operativa`
- Título: `Respaldo y recuperación de la operación`
- Subtítulo: `MSP360 Managed Backup · Almacenamiento inmutable en Wasabi`
- Intro: el párrafo del ransomware y el tiempo de vuelta a operar.

**Capacidades — 4, con sus iconos SVG ya dibujados en el HTML:**

| # | Título | Icono (clave sugerida) |
|---|---|---|
| 1 | Respaldo de imagen, archivos y aplicaciones | `capas` |
| 2 | Copia inmutable fuera del sitio | `nubeCheck` |
| 3 | Cifrado y control de acceso | `llave` |
| 4 | Consola única y verificación de restauración | `monitorPulso` |

Los iconos siguen el mismo contrato que los de SentinelOne: `viewBox 24×24`, trazo 1.6, color `--purple`, sin relleno. Copiar los `<path>` tal cual; no sustituirlos por iconos de otra familia.

**Panel destacado.** Etiqueta `Garantía de continuidad`, título `Recuperación ante hackeo o desastre`, las dos cifras `11 NUEVES` (durabilidad) y `$0 USD` (descarga o restauración), y la letra chica que acota inmutabilidad, RTO/RPO y política de uso razonable de Wasabi. **La letra chica no es opcional:** es lo que mantiene el argumento de garantía dentro de lo que los fabricantes respaldan.

**Conceptos sugeridos — 4 partidas, tres mensuales y una única:**

| Concepto | Cantidad | Vigencia | Recurrencia |
|---|---|---|---|
| Licenciamiento MSP360 Managed Backup | por equipo | Mensual | `mensual` |
| Almacenamiento inmutable Wasabi (por TB) | por TB | Mensual | `mensual` |
| Implementación y puesta en marcha | 1 | Proyecto | `unica` |
| Administración y soporte Waxxor | — | Mensual | `mensual` |

El soporte se precarga con `precioUnitarioCentavos: null` ("No Incluido"); se cotiza cuando el cliente lo contrata.

**Totales duales.** `modo: 'dual'`. Dos columnas: **Pago único** con barra `Total`, y **Mensualidad** con barra `Por mes`. El IVA se captura una sola vez y aplica a ambas.

**Términos:** las seis viñetas del HTML, en tres columnas. La vigencia de la propuesta **no va en términos**: vive en la franja de datos, editable, y duplicarla produce documentos que se contradicen.

`maxPartidas: 4`.

### 8.3 Color del fabricante **[v2]**

La v1 fijaba `--s1` en el CSS. Pasa a ser `--marca`, inyectado por el renderizador desde `producto.colorFabricante` como variable en línea sobre `.page`:

```tsx
<div className="page" style={{ '--marca': producto.colorFabricante } as CSSProperties}>
```

Valores actuales: SentinelOne `#6100FF`, MSP360 `#F15A22`. Renombrar los usos de `var(--s1)` en `documento.css`. Es el único token que cambia entre productos; el resto de la paleta es de Waxxor y no se toca.

### 8.4 Cómo se agrega el siguiente producto

Una entrada nueva en el catálogo, con sus capacidades, su panel, sus conceptos sugeridos, sus términos, su `maxPartidas` medido y su variante. **El renderizador no cambia.** Si un producto necesitara un bloque que no existe en ninguna de las dos variantes, eso es un cambio al sistema de diseño: se decide antes de escribir código, no durante.

---

## 9. Generación de PDF

Puppeteer en el servidor, apuntando a la ruta `/p/{folio}` del propio portal.

```ts
const navegador = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pagina = await navegador.newPage();

await pagina.goto(`${BASE_URL}/p/${folio}?t=${tokenFirmado}`, {
  waitUntil: 'networkidle0',
});
await pagina.evaluateHandle('document.fonts.ready');   // sin esto cambia la tipografía

const pdf = await pagina.pdf({
  printBackground: true,        // sin esto el documento sale en blanco
  preferCSSPageSize: true,      // respeta @page { size: Letter; margin: 0 }
});
```

### Puntos que suelen fallar

1. **`printBackground: true`** es obligatorio. El CSS ya trae `print-color-adjust: exact`, pero Puppeteer necesita además esta bandera. Sin ella la barra tricolor, el hero marino, las cabeceras de tabla y la barra de total salen blancas, y el texto blanco sobre esos fondos desaparece.
2. **`document.fonts.ready`** antes de imprimir. Si no, Poppins no alcanza a cargar y el PDF sale con la tipografía de respaldo.
3. **Autenticación.** El navegador headless no tiene la sesión del usuario. Emitir un token HMAC de vida corta (60 s) con el folio dentro, validarlo en la ruta del documento y no aceptar nada más. No abrir la ruta al público.
4. **`preferCSSPageSize: true`**, no `format: 'Letter'`. El `@page` del CSS ya define tamaño y márgenes cero; pasar el formato por opciones genera un margen fantasma.
5. **Chromium en producción.** Si el despliegue es serverless, usar `@sparticuz/chromium` con `puppeteer-core`. En contenedor propio, instalar Chromium en la imagen y fijar `PUPPETEER_EXECUTABLE_PATH`.

### 9.1 Verificación de ajuste — **[v2] nuevo, obligatorio**

Las plantillas llenan la hoja sin holgura, así que un texto largo en una partida basta para empujar el pie fuera de la página. Antes de generar el PDF, en la misma sesión de Puppeteer:

```ts
const desborde = await pagina.evaluate(() => {
  const pagina = document.querySelector('.page')!.getBoundingClientRect();
  const pie    = document.querySelector('.foot')!.getBoundingClientRect();
  return Math.round(pie.bottom - pagina.bottom);   // > 0 significa desborde
});

if (desborde > 0) {
  throw new ErrorDeAjuste(
    `El documento desborda ${desborde}px (~${(desborde / 3.78).toFixed(1)} mm). ` +
    `Acorta descripciones o reduce partidas.`
  );
}
```

La emisión **falla** y revierte la transacción; no se emite un folio para un documento roto. El mensaje llega al formulario para que el usuario acorte el texto.

Una tolerancia de `0` es correcta: las plantillas aprobadas miden exactamente `pie.bottom === pagina.bottom`.

### Archivado

Al emitir se genera el PDF una sola vez, se calcula su `sha256` y se guarda en almacenamiento de objetos con ruta `propuestas/{anio}/{folio}.pdf`. Se persisten `pdf_ruta` y `pdf_sha256`.

Las descargas posteriores sirven ese archivo, **no regeneran**. El hash permite demostrar que el PDF que recibió el cliente es el mismo que está archivado.

---

## 10. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/propuestas` | Listado con filtros `estado`, `cliente`, `producto`, `desde`, `hasta`, paginado |
| `POST` | `/api/propuestas` | Crea borrador. Valida, recalcula totales, devuelve el registro |
| `GET` | `/api/propuestas/:id` | Detalle |
| `PATCH` | `/api/propuestas/:id` | Edita. **Rechaza con 409 si el estado no es borrador** |
| `POST` | `/api/propuestas/:id/emitir` | Transacción: folio → snapshot → **verificación de ajuste** → PDF → estado `emitida` |
| `POST` | `/api/propuestas/:id/estado` | Cambia estado validando `TRANSICIONES` |
| `POST` | `/api/propuestas/:id/clonar` | Nuevo borrador a partir de una propuesta existente |
| `GET` | `/api/propuestas/:folio/pdf` | Devuelve el PDF archivado |
| `GET` | `/p/:folio` | Documento HTML desnudo. Token HMAC o sesión válida |
| `GET` | `/api/catalogo` | **[v2]** Productos, variantes, paquetes y conceptos sugeridos, para el formulario |

---

## 11. Validaciones obligatorias

- `conceptos.length` entre 1 y `producto.maxPartidas` **[v2]**.
- Al menos una partida con `precioUnitarioCentavos !== null` para poder emitir.
- **[v2]** `recurrencia` presente en toda partida. Si el producto es de totales duales, al menos una partida de cada recurrencia; si es de totales simples, todas `unica`.
- `cliente` y `preparadaPor` no vacíos.
- `fecha` válida; `venceEn = fecha + vigenciaDias` se calcula en servidor.
- `ivaBps` entre 0 y 10 000.
- **[v2]** `paquete` ∈ catálogo del producto si la variante es `tiers`; `null` si es `simple`. Rechazar un paquete enviado a un producto sin paquetes.
- No emitir si el estado no es `borrador`.
- No editar nada cuyo estado no sea `borrador`.
- **[v2]** No emitir si la verificación de ajuste (9.1) reporta desborde.

---

## 12. Criterios de aceptación

Verificar uno por uno antes de dar por terminado el módulo:

1. El PDF generado es **visualmente idéntico** a la plantilla del producto impresa desde Chrome. Comparar superponiendo ambos, para SentinelOne y para MSP360.
2. El PDF sale **con todos los fondos de color** y ocupa **exactamente una página**, en los dos productos.
3. Cambiar de paquete en el formulario de SentinelOne actualiza título, intro, las tres capacidades con sus iconos, el renglón de licenciamiento y la columna resaltada del comparativo.
4. **[v2]** Elegir MSP360 en el formulario oculta el selector de paquetes y el comparativo, muestra cuatro capacidades, precarga las cuatro partidas y dibuja dos logotipos de fabricante en el encabezado.
5. Emitir dos propuestas en paralelo (dos pestañas, mismo instante) produce **dos folios distintos y consecutivos**, aunque sean de productos distintos.
6. Una propuesta emitida **no se puede editar**: el `PATCH` responde 409.
7. Cambiar un texto del catálogo en código **no altera** el documento de una propuesta ya emitida, ni su logotipo de fabricante.
8. Los totales de SentinelOne cuadran al centavo: 120 × $1,850.00 + $9,500.00 + 120 × $60.00 = subtotal $238,700.00, IVA 16 % $38,192.00, total **$276,892.00**.
9. **[v2]** Los totales duales de MSP360 cuadran al centavo y **no se mezclan**: 25 × $180.00 (mensual) + 2 × $290.00 (mensual) + $2,500.00 (mensual) + $18,000.00 (único) da pago único subtotal $18,000.00, IVA $2,880.00, total **$20,880.00**; y mensualidad subtotal $7,580.00, IVA $1,212.80, total **$8,792.80**. En ninguna parte del documento aparece la suma de ambas columnas.
10. **[v2]** Una propuesta con una descripción larga de más es **rechazada al emitir** con el error de ajuste, y no consume folio.
11. **[v2]** Un snapshot `version: 1` guardado antes de esta versión sigue dibujando su documento sin cambios.
12. El `sha256` del PDF descargado hoy coincide con el guardado al emitir.
13. El documento abierto en `/p/{folio}` no hereda ningún estilo de Tailwind.

---

## 13. Prompt para Claude Code

> Implementa el módulo de Propuestas según la especificación adjunta `ESPEC_Modulo_Propuestas_Waxxor.md` (versión 2), usando como referencia visual `Waxxor_Propuesta_SentinelOne_Singularity_EDITABLE.html` y `Waxxor_Propuesta_MSP360_Wasabi_EDITABLE.html`.
>
> Respeta estas restricciones, que son las que suelen romperse:
>
> 1. El documento de la propuesta vive en un grupo de rutas `(documento)` con su propio layout raíz que **no importa Tailwind**. Copia el CSS de las plantillas tal cual a un único `documento.css`, quitando sólo el bloque `@media screen` de edición y la `.toolbar`, y sin duplicar reglas comunes.
> 2. Todo el dinero en **centavos enteros**. Los totales se recalculan en el servidor, **por recurrencia**, redondeando el IVA en cada columna por separado. Nunca sumes la columna única con la mensual.
> 3. El folio se asigna **sólo al emitir**, con la función SQL atómica de la sección 5.3, dentro de la misma transacción que el snapshot y la verificación de ajuste.
> 4. Al emitir, congela el snapshot en `version: 2`, incluyendo el base64 de los logotipos de fabricante. El renderizador lee del snapshot cuando existe y sigue aceptando `version: 1`.
> 5. Puppeteer con `printBackground: true`, `preferCSSPageSize: true`, espera de `document.fonts.ready` y la **verificación de ajuste de la sección 9.1 antes de imprimir**.
> 6. El máximo de partidas lo fija el producto: 3 en SentinelOne, 4 en MSP360. No es 5.
>
> Extrae el catálogo de SentinelOne (títulos, intros, capacidades, iconos SVG, filas del comparativo y panel) del objeto `TIERS` y el bloque `ICO` de su plantilla. Extrae el de MSP360 (cuatro capacidades con sus iconos, panel de continuidad con su letra chica, cuatro conceptos sugeridos con su recurrencia, términos y los dos logotipos en base64) de la suya. **No reescribas ninguno de los dos.**
>
> Antes de terminar, recorre los criterios de aceptación de la sección 12 y reporta el resultado de cada uno.

---

## 14. Siguientes productos

El módulo queda listo para más catálogos sin tocar el renderizador.

- **Microsoft 365** — pendiente, a partir de las propuestas de ASELEC y Unita que están en el proyecto. Habrá que decidir primero si lleva comparativo de planes (variante `tiers`, como SentinelOne) o una sola configuración (variante `simple`, como MSP360), y medir su `maxPartidas` sobre la plantilla antes de codificarlo.
- **Servicios administrados y consultoría** — probablemente variante `simple` con totales duales, igual que MSP360.

Cada uno se agrega como una entrada nueva en el catálogo, con sus capacidades, su panel destacado y, si aplica, su comparativo.
