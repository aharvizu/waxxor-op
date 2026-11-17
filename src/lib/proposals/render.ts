import { itemAmountCents } from "./calc";
import { CSS_DENSE, CSS_STANDARD } from "./document-css";
import { formatCents } from "./money";
import type { MoneyColumn, ProposalDocument } from "./types";

/**
 * Renderizador único del documento de propuesta: devuelve la página HTML
 * completa como texto. Lo sirve la ruta /p/[id] SIN pasar por ningún layout
 * de Next, así que el documento no hereda Tailwind ni nada del portal — el
 * preflight de Tailwind rompe la retícula en milímetros (spec §2). La vista
 * previa del portal es un <iframe> de esa misma ruta y el PDF es la impresión
 * del navegador sobre ella: pantalla y PDF nunca divergen.
 *
 * La estructura y las clases son las de las plantillas aprobadas en
 * docs/sales/. No rediseñar.
 */

/** Escapa lo que capturó un usuario. Los campos *Html del catálogo no pasan por aquí. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const icon = (inner: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A2BF5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const QTY = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** 1600 → "16", 1650 → "16.5" */
function ivaPercent(bps: number): string {
  return String(bps / 100);
}

function section(n: number, title: string): string {
  return `<div class="sec"><div class="n">${String(n).padStart(2, "0")}</div><h2>${title}</h2><div class="ln"></div></div>`;
}

function totalsColumn(header: string, totalLabel: string, col: MoneyColumn, ivaBps: number): string {
  return `<div class="col">
          <div class="hd">${header}</div>
          <div class="row"><span>Subtotal</span><span>${formatCents(col.subtotalCents)}</span></div>
          <div class="row"><span>IVA <span class="iva">${ivaPercent(ivaBps)}</span> %</span><span>${formatCents(col.ivaCents)}</span></div>
          <div class="grand"><span>${totalLabel}</span><span><span>${formatCents(col.totalCents)}</span><small>MXN</small></span></div>
        </div>`;
}

/**
 * Totales en columnas por recurrencia (2026-11-17, a pedido del dueño: pago
 * único, mensual y anual identificados por separado). Extiende la caja
 * `.box.dual` de la plantilla sin tocar sus reglas: una columna conserva el
 * ancho de la caja simple, dos conservan los 120 mm de la plantilla, y tres
 * ocupan el ancho completo con la nota en su propio renglón encima — a 120 mm
 * tres columnas no caben con importes de seis cifras.
 */
const SPLIT_TOTALS_CSS = `
.totals .box.dual.cols-1{ width:78mm; }
.totals.cols-3{ flex-direction:column; align-items:stretch; gap:1.6mm; }
.totals.cols-3 .note{ padding-top:0; }
.totals.cols-3 .box.dual{ width:100%; }
`;

/** Capa de pantalla propia del portal (la de las plantillas era la de edición a mano y no se porta). */
const SCREEN_CSS = `
.draft-mark{ position:absolute; left:0; right:0; top:118mm; text-align:center; transform:rotate(-24deg);
  font-size:64pt; font-weight:700; letter-spacing:.12em; color:rgba(122,43,245,.10); pointer-events:none; z-index:5; }
@media screen{
  body{ background:#EDEBF3; padding:60px 0 12mm 0; }
  body.embed{ padding:6mm 0; }
  .page{ margin:0 auto; box-shadow:0 4mm 14mm rgba(36,28,97,.18); }
  .page.excede{ box-shadow:0 0 0 1.2mm #E5484D, 0 4mm 14mm rgba(36,28,97,.18); }
  .toolbar{ position:fixed; top:0; left:0; right:0; z-index:99; background:#241C61; color:#fff;
    font-family:'Poppins',sans-serif; font-size:11px; padding:9px 16px; display:flex; align-items:center; gap:14px; }
  .toolbar b{ letter-spacing:.14em; text-transform:uppercase; font-weight:600; }
  .toolbar span{ color:#C3BAEC; font-weight:300; flex:1; }
  .toolbar #aviso{ flex:0 0 auto; font-weight:600; background:#E5484D; color:#fff; border-radius:4px; padding:6px 10px; }
  .toolbar #aviso.info{ background:#FFE7A3; color:#241C61; }
  .toolbar #aviso[hidden]{ display:none; }
  .toolbar button{ font-family:'Poppins',sans-serif; font-size:11px; font-weight:600;
    background:#7A2BF5; color:#fff; border:0; border-radius:4px; padding:7px 16px; cursor:pointer; }
}
@media print{ .toolbar{ display:none !important; } }
`;

/**
 * Verificación de ajuste a una hoja (spec §9.1), en el navegador: las
 * plantillas llenan la carta sin holgura y un texto largo basta para empujar
 * el pie fuera de la página. Con `levels` (plantilla de Microsoft 365)
 * primero compacta el cierre: retira la firma, pasa la aceptación a los
 * términos, y oculta descripciones de licencias agregadas desde la última.
 * Informa el resultado al portal por postMessage — es lo que bloquea el botón
 * de emitir — y lo repite antes de imprimir.
 */
function fitScript(levels: boolean, autoPrint: boolean): string {
  return `<script>
(function(){
  var pg = document.querySelector('.page'), foot = document.querySelector('.foot');
  var aviso = document.getElementById('aviso'), LEVELS = ${levels ? "true" : "false"};
  var textos = ['', 'Ajuste a una hoja: se retiró la línea de firma',
    'Ajuste a una hoja: la aceptación pasó a los términos, sin firma',
    'Ajuste a una hoja: sin firma; se ocultó la descripción de licencias agregadas'];
  function excede(){ return foot.getBoundingClientRect().bottom > pg.getBoundingClientRect().bottom + 1; }
  function revisar(){
    var n = 0, extras = [].slice.call(document.querySelectorAll('#conceptos > tr.extra')).reverse();
    pg.classList.remove('ajuste-1','ajuste-2');
    extras.forEach(function(tr){ tr.classList.remove('sin-desc'); });
    if(LEVELS){
      while(excede() && n < 2){ n++; pg.classList.add('ajuste-' + n); }
      for(var i = 0; i < extras.length && excede(); i++){ extras[i].classList.add('sin-desc'); n = 3; }
    }
    var sigue = excede();
    var mm = sigue ? Math.round((foot.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom) / 3.78 * 10) / 10 : 0;
    pg.classList.toggle('excede', sigue);
    if(aviso){
      aviso.classList.toggle('info', !sigue);
      aviso.textContent = sigue ? 'No cabe en una hoja (' + mm + ' mm): acorta o elimina conceptos' : textos[n];
      aviso.hidden = !sigue && n === 0;
    }
    if(window.parent !== window){
      window.parent.postMessage({ type:'proposal-fit', overflow:sigue, overflowMm:mm, level:n }, window.location.origin);
    }
    return sigue;
  }
  window.addEventListener('beforeprint', revisar);
  window.addEventListener('resize', revisar);
  var listo = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  // Sin esperar a la tipografía la medida sale con la fuente de respaldo y miente.
  listo.then(function(){ var sigue = revisar(); ${autoPrint ? "if(!sigue) window.print();" : ""} });
  window.addEventListener('load', revisar);
})();
</script>`;
}

export type RenderOptions = {
  /** Dentro del <iframe> de vista previa: sin barra. */
  embed?: boolean;
  /** Abre el diálogo de impresión al cargar (si el documento cabe). */
  autoPrint?: boolean;
};

export function renderProposalHtml(doc: ProposalDocument, options: RenderOptions = {}): string {
  const isDraft = doc.folio === null;
  const title = `${doc.folio ?? "Borrador"} · ${doc.header.clientName} · ${doc.productName}`;
  const split = doc.totals.mode === "split";
  let n = 0;

  const partnerMarks = doc.partner.marks
    .map((m) =>
      m.kind === "image"
        ? `<div class="rule"></div>
        <div class="s1lock"><img src="${m.dataUri}" alt="${esc(m.alt)}" style="height:${m.height};display:block"></div>`
        : `<div class="rule"></div>
        <div class="s1lock"><div class="name">${m.name}</div><div class="sub">${m.sub}</div></div>`,
    )
    .join("\n        ");

  const capabilities = doc.capabilities
    .map(
      (c) => `<div class="cap">
          <div class="ico">${icon(c.iconSvg)}</div>
          <div><h3>${c.titleHtml}${c.tag ? ` <span class="tag">${c.tag}</span>` : ""}</h3><p>${c.text}</p></div>
        </div>`,
    )
    .join("\n        ");

  const figures = doc.panel.figures
    .map((f) => `<div class="fig"><div class="num">${f.number}<small>${f.unit}</small></div><div class="cap2">${f.caption}</div></div>`)
    .join("\n          ");

  const comparison = doc.comparison
    ? `${section(++n + 1, "Comparativo de paquetes")}
    <table class="matrix">
      <thead>
        <tr>
          <th style="width:49%">Capacidad</th>
          ${doc.comparison.columns
            .map((c) => `<th style="width:17%"${c.key === doc.comparison!.selected ? ' class="sel"' : ""}>${c.name}<span class="tag">${c.tag}</span></th>`)
            .join("\n          ")}
        </tr>
      </thead>
      <tbody>
        ${doc.comparison.rows
          .map(
            (r) => `<tr>
          <td>${r.label}</td>
          ${doc.comparison!.columns
            .map((c) => `<td${c.key === doc.comparison!.selected ? ' class="sel"' : ""}><i class="dot${r.included.includes(c.key) ? "" : " off"}"></i></td>`)
            .join("")}
        </tr>`,
          )
          .join("\n        ")}
      </tbody>
    </table>`
    : "";

  const rows = doc.items
    .map((item) => {
      const amount = itemAmountCents(item);
      return `<tr${item.extra ? ' class="lic extra"' : ""}>
          <td><strong>${esc(item.title)}</strong>${item.description ? `<em>${esc(item.description)}</em>` : ""}</td>
          <td class="r">${item.quantity === null ? "—" : QTY.format(item.quantity)}</td>
          <td class="r">${esc(item.termLabel)}</td>
          <td class="r">${item.unitPriceCents === null ? "No Incluido" : formatCents(item.unitPriceCents)}</td>
          <td class="r">${amount === null ? "No Incluido" : formatCents(amount)}</td>
        </tr>`;
    })
    .join("\n        ");

  const columns = doc.totals.columns;
  const totalsBox = split
    ? `<div class="box dual cols-${columns.length}">
        ${columns.map((c) => totalsColumn(c.header, c.totalLabel, c, doc.totals.ivaBps)).join("\n        ")}
      </div>`
    : `<div class="box">
        <div class="row"><span>Subtotal</span><span>${formatCents(columns[0]?.subtotalCents ?? 0)}</span></div>
        <div class="row"><span>IVA <span class="iva">${ivaPercent(doc.totals.ivaBps)}</span> %</span><span>${formatCents(columns[0]?.ivaCents ?? 0)}</span></div>
        <div class="grand"><span>Inversión total</span><span><span>${formatCents(columns[0]?.totalCents ?? 0)}</span><small>MXN</small></span></div>
      </div>`;

  // La viñeta corta de aceptación va al final de la primera columna; solo se
  // muestra cuando el ajuste nivel 2 retira el recuadro de cierre.
  const terms = doc.termsHtml
    .map(
      (col, i) =>
        `<ul>\n        ${col.map((li) => `<li>${li}</li>`).join("\n        ")}${i === 0 && doc.fitLevels ? `\n        <li class="acc">${doc.termsAcceptanceHtml}</li>` : ""}\n      </ul>`,
    )
    .join("\n      ");

  const solutionSection = section(1, "Solución propuesta");
  const comparisonBlock = comparison; // usa ++n: tras él, n vale 1 si hubo comparativo
  const economicSection = section(n + 2, "Propuesta económica");
  const termsSection = section(n + 3, "Términos y condiciones");

  const toolbar = options.embed
    ? ""
    : `<div class="toolbar">
  <b>Waxxor · ${isDraft ? "Borrador sin folio" : esc(doc.folio!)}</b>
  <span>${esc(doc.header.clientName)} · ${doc.productName}</span>
  <em id="aviso" hidden></em>
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
${doc.layout === "dense" ? CSS_DENSE : CSS_STANDARD}
${SPLIT_TOTALS_CSS}
${SCREEN_CSS}
</style>
</head>
<body${options.embed ? ' class="embed"' : ""}>
${toolbar}
<div class="page" style="--marca:${doc.brandColor};position:relative">
${isDraft ? '  <div class="draft-mark">BORRADOR</div>' : ""}
  <div class="topbar"><i></i><i></i><i></i></div>

  <div class="body">

    <div class="head">
      <img src="${doc.waxxorLogo}" alt="Waxxor Seguridad Informática">
      <div class="partner">
        <div class="lbl">${doc.partner.labelHtml}</div>
        ${partnerMarks}
      </div>
    </div>

    <div class="hero">
      <svg width="120" height="120" viewBox="0 0 150 150" fill="none">
        <path d="M75 8 L133 41 L133 108 L75 141 L17 108 L17 41 Z" stroke="#fff" stroke-width="1.2"/>
        <path d="M75 30 L114 52 L114 96 L75 118 L36 96 L36 52 Z" stroke="#fff" stroke-width="1.2"/>
        <path d="M75 52 L95 63 L95 85 L75 96 L55 85 L55 63 Z" fill="#fff" fill-opacity="0.5"/>
      </svg>
      <div class="eyebrow">${doc.hero.eyebrow}</div>
      <h1>${doc.hero.titleHtml}<span id="h-sub">${doc.hero.subtitle}</span></h1>
      <p>${doc.hero.intro}</p>
    </div>

    <div class="meta">
      <div><div class="k">Preparada para</div><div class="v">${esc(doc.header.clientName)}</div></div>
      <div><div class="k">Preparada por</div><div class="v">${esc(doc.header.preparedBy)}</div></div>
      <div><div class="k">Fecha</div><div class="v">${esc(doc.header.dateLabel)}</div></div>
      <div><div class="k">Vigencia</div><div class="v">${esc(doc.header.validityLabel)}</div></div>
    </div>

    ${solutionSection}

    <div class="split">
      <div class="caps">
        ${capabilities}
      </div>
      <div class="warranty">
        <div class="badge">${doc.panel.badge}</div>
        <h3>${doc.panel.title}</h3>
        <p>${doc.panel.bodyHtml}</p>
        <div class="figs">
          ${figures}
        </div>
        <div class="fine">${doc.panel.finePrint}</div>
      </div>
    </div>

    ${comparisonBlock}

    ${economicSection}

    <table class="econ">
      <thead>
        <tr>
          <th style="width:48%">Concepto</th>
          <th class="r" style="width:13%">${doc.quantityHeader}</th>
          <th class="r" style="width:12%">Vigencia</th>
          <th class="r" style="width:13.5%">P. Unitario</th>
          <th class="r" style="width:13.5%">Importe</th>
        </tr>
      </thead>
      <tbody id="conceptos">
        ${rows}
      </tbody>
    </table>

    <div class="totals${split ? ` cols-${columns.length}` : ""}">
      <div class="note">${doc.note ? `<b>Nota:</b> ${esc(doc.note)}` : ""}</div>
      ${totalsBox}
    </div>

    ${termsSection}

    <div class="terms">
      ${terms}
    </div>

    <div class="close">
      <div class="accept">${doc.acceptanceHtml}</div>
      <div class="sign">
        <div class="line"></div>
        <div class="lbl">${doc.signatureLabel}</div>
      </div>
    </div>

  </div>

  <div class="foot">
    <div class="t"><b>Waxxor</b> · ${doc.footer.tagline}</div>
    <div class="c"><span class="wa"><svg viewBox="0 0 24 24" aria-label="WhatsApp">
      <path d="M12 2.2A9.8 9.8 0 0 0 3.6 17L2.3 21.7l4.8-1.25A9.8 9.8 0 1 0 12 2.2Z" fill="#fff"/>
      <path d="M9.15 7.55c.28-.66 1-.78 1.44-.2l.93 1.26c.22.3.22.7 0 1l-.5.63c-.2.25-.2.55-.03.8.5.78 1.2 1.47 1.98 1.98.25.17.55.16.8-.04l.63-.5c.3-.23.7-.23 1 0l1.26.92c.58.43.46 1.16-.2 1.44-1 .43-2.16.28-3.5-.46-1.36-.75-2.55-1.94-3.3-3.3-.74-1.34-.9-2.5-.46-3.53Z" fill="#241C61"/>
    </svg><i>${doc.footer.phone}</i></span><em>·</em><i>${doc.footer.site}</i><em>·</em><i>${doc.footer.email}</i></div>
  </div>

</div>
${fitScript(doc.fitLevels, options.autoPrint === true)}
</body>
</html>`;
}
