import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

/**
 * GET /api/ventas/[id]/factura-preimpreso
 *
 * Impresión de FACTURA sobre formulario PREIMPRESO (overlay por coordenadas).
 *
 * El papel ya trae impreso el membrete, timbrado, RUC del emisor y los recuadros.
 * Esta ruta imprime ÚNICAMENTE los datos de la venta, posicionados en milímetros
 * para que caigan dentro de cada casillero del formulario.
 *
 * Formulario: "DISEÑO FACTURA MAVA 2026" — hoja 297 x 215.9 mm, apaisada, con
 * DOS facturas lado a lado (ORIGINAL izquierda / DUPLICADO derecha), separadas por
 * la línea del medio en x=148.5mm. Se imprime el MISMO dato en las dos mitades.
 * Impresora objetivo: matricial de papel continuo.
 *
 * Query params:
 *   - dx, dy   : ajuste fino global en mm (calibración). Ej: ?dx=1.5&dy=-2
 *   - half     : "both" (default) | "left"  → una o las dos mitades
 *   - numero=1 : imprime el Nº de factura (por defecto NO, porque suele venir
 *                preimpreso en el talonario)
 *   - cal=1    : dibuja una grilla guía tenue en pantalla para calibrar (no sale al imprimir)
 *   - demo=1   : usa datos de ejemplo (para calibrar sin una venta real)
 *   - auto=1   : dispara window.print() al cargar
 *
 * No toca SIFEN, no genera XML, no usa timbrado electrónico.
 */

// ── Geometría del formulario (mm, origen arriba-izquierda de la hoja) ─────────
// Medidas extraídas del PDF vectorial de la imprenta. Bloque IZQUIERDO (original).
const PAGE = { w: 297, h: 215.9 };
const DX_DUPLICADO = 146.5; // desplazamiento del bloque derecho (duplicado)

// Columnas de la tabla de ítems: límites x (mm) del bloque izquierdo.
const COL = {
  cantRight: 13.0, //  CANT        : 6     → 13.5
  descLeft: 15.0, //   DESCRIPCIÓN : 13.5  → 97.5
  puRight: 107.5, //   PRECIO UNIT.: 97.5  → 108.5
  exentasRight: 118.5, // EXENTAS   : 108.5 → 119.5
  iva5Right: 129.5, //   5%        : 119.5 → 130.5
  iva10Right: 143.5, //  10%       : 130.5 → 144.5
};

// Filas de la tabla de ítems.
const ITEMS = { top: 71.0, rowH: 4.8, maxRows: 21 };

// Posiciones de campos escalares (mm). y = borde superior del texto.
const F = {
  numero: { x: 98.0, y: 30.5 }, //      campo Nº (header, solo si numero=1)
  fecha: { x: 24.0, y: 37.5 }, //       fila FECHA (y 36.5→44.5)
  condContado: { x: 122.5, y: 37.5 }, //casillero CONTADO
  condCredito: { x: 142.5, y: 37.5 }, //casillero CRÉDITO
  ruc: { x: 22.0, y: 46.0 }, //         fila R.U.C. (y 44.5→53)
  razon: { x: 44.0, y: 56.5 }, //       fila NOMBRE/RAZÓN SOCIAL (y 53→61)
  subtotal: { xRight: 143.5, y: 178.0 }, // SUB TOTAL (y 175.5→189.5)
  totalPagar: { xRight: 143.5, y: 185.0 }, // TOTAL A PAGAR Gs.:
  liqIva5: { xRight: 70.0, y: 194.0 }, //   LIQUIDACIÓN DEL IVA (5%)
  liqIva10: { xRight: 112.0, y: 194.0 }, // (10%)
  totalIva: { xRight: 143.5, y: 194.0 }, // TOTAL IVA:
};

// ── Tipos ────────────────────────────────────────────────────────────────────
interface VentaRow {
  id: string;
  numero_control: string | null;
  fecha: string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  metodo_pago: string | null;
  tipo_venta: string | null;
  cliente_id: string | null;
}
interface ItemRow {
  producto_nombre: string;
  cantidad: number | string;
  precio_venta: number | string;
  total_linea: number | string;
  tipo_iva: string | null;
  monto_iva: number | string | null;
}
interface ClienteRow {
  nombre: string | null;
  empresa: string | null;
  nombre_contacto: string | null;
  ruc: string | null;
  documento: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function nf(v: number): string {
  return Math.round(v).toLocaleString("es-PY");
}
function fechaCorta(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}
type Tasa = "EXENTA" | "5%" | "10%";
function normTasa(t: string | null | undefined): Tasa {
  if (t === "5%" || t === "5") return "5%";
  if (t === "EXENTA" || t === "exenta") return "EXENTA";
  return "10%";
}

// Un dato absolutamente posicionado (mm). align: "left" | "right".
function dato(
  x: number,
  y: number,
  text: string,
  opts: { align?: "left" | "right"; bold?: boolean; size?: number } = {}
): string {
  const { align = "left", bold = false, size = 8 } = opts;
  const style =
    align === "right"
      ? `right:${PAGE.w - x}mm;text-align:right;`
      : `left:${x}mm;`;
  return `<div class="d" style="${style}top:${y}mm;font-size:${size}pt;${bold ? "font-weight:700;" : ""}">${text}</div>`;
}

// ── Render de UN bloque (una factura) ────────────────────────────────────────
function renderBloque(
  offsetX: number,
  data: {
    numero: string | null;
    fecha: string;
    esContado: boolean;
    ruc: string;
    razon: string;
    items: Array<{ cant: string; desc: string; pu: number; valor: number; tasa: Tasa }>;
    subtotal: number;
    totalPagar: number;
    liq5: number;
    liq10: number;
    totalIva: number;
    printNumero: boolean;
  }
): string {
  const partes: string[] = [];
  const X = (x: number) => x + offsetX;

  if (data.printNumero && data.numero) {
    partes.push(dato(X(F.numero.x), F.numero.y, escapeHtml(data.numero), { bold: true, size: 9 }));
  }
  partes.push(dato(X(F.fecha.x), F.fecha.y, escapeHtml(data.fecha)));
  partes.push(
    data.esContado
      ? dato(X(F.condContado.x), F.condContado.y, "X", { bold: true, size: 9 })
      : dato(X(F.condCredito.x), F.condCredito.y, "X", { bold: true, size: 9 })
  );
  if (data.ruc) partes.push(dato(X(F.ruc.x), F.ruc.y, escapeHtml(data.ruc)));
  if (data.razon) partes.push(dato(X(F.razon.x), F.razon.y, escapeHtml(data.razon)));

  // Ítems
  data.items.slice(0, ITEMS.maxRows).forEach((it, idx) => {
    const y = ITEMS.top + idx * ITEMS.rowH;
    partes.push(dato(X(COL.cantRight), y, escapeHtml(it.cant), { align: "right" }));
    partes.push(dato(X(COL.descLeft), y, escapeHtml(it.desc)));
    partes.push(dato(X(COL.puRight), y, nf(it.pu), { align: "right" }));
    const colX =
      it.tasa === "EXENTA" ? COL.exentasRight : it.tasa === "5%" ? COL.iva5Right : COL.iva10Right;
    partes.push(dato(X(colX), y, nf(it.valor), { align: "right" }));
  });

  // Totales
  partes.push(dato(X(F.subtotal.xRight), F.subtotal.y, nf(data.subtotal), { align: "right", bold: true }));
  partes.push(dato(X(F.totalPagar.xRight), F.totalPagar.y, nf(data.totalPagar), { align: "right", bold: true }));
  if (data.liq5 > 0) partes.push(dato(X(F.liqIva5.xRight), F.liqIva5.y, nf(data.liq5), { align: "right" }));
  if (data.liq10 > 0) partes.push(dato(X(F.liqIva10.xRight), F.liqIva10.y, nf(data.liq10), { align: "right" }));
  partes.push(dato(X(F.totalIva.xRight), F.totalIva.y, nf(data.totalIva), { align: "right", bold: true }));

  return partes.join("\n");
}

// Grilla guía (solo pantalla, para calibrar).
function gridGuia(offsetX: number): string {
  const lineas: string[] = [];
  const push = (css: string) => lineas.push(`<div class="g" style="${css}"></div>`);
  // Verticales de columnas
  [6, 13.5, 97.5, 108.5, 119.5, 130.5, 144.5].forEach((x) =>
    push(`left:${x + offsetX}mm;top:61mm;height:114.5mm;width:0;border-left:0.2mm dashed #38bdf8;`)
  );
  // Horizontales clave
  [36.5, 44.5, 53, 61, 69, 175.5, 189.5, 198.5].forEach((y) =>
    push(`left:${6 + offsetX}mm;top:${y}mm;width:138.5mm;height:0;border-top:0.2mm dashed #38bdf8;`)
  );
  // Filas de ítems
  for (let i = 0; i <= ITEMS.maxRows; i++) {
    const y = ITEMS.top + i * ITEMS.rowH;
    push(`left:${6 + offsetX}mm;top:${y}mm;width:138.5mm;height:0;border-top:0.1mm dotted #fca5a5;`);
  }
  return lineas.join("\n");
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const url = new URL(request.url);
  // Calibración por defecto contra la matricial de Ferretería Chaco.
  // Se puede sobrescribir en vivo con ?dx= y ?dy= (mm). + derecha / + abajo.
  const CAL_DX = 0;
  const CAL_DY = 2;
  const dxParam = url.searchParams.get("dx");
  const dyParam = url.searchParams.get("dy");
  const dx = dxParam !== null ? (Number(dxParam) || 0) : CAL_DX;
  const dy = dyParam !== null ? (Number(dyParam) || 0) : CAL_DY;
  const soloIzquierda = url.searchParams.get("half") === "left";
  const printNumero = url.searchParams.get("numero") === "1";
  const cal = url.searchParams.get("cal") === "1";
  const demo = url.searchParams.get("demo") === "1";
  const auto = url.searchParams.get("auto") === "1";

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const empresaId = ctx.auth.empresa_id;

  let data: Parameters<typeof renderBloque>[1];

  if (demo) {
    data = {
      numero: "001-001-0000123",
      fecha: fechaCorta(new Date().toISOString()),
      esContado: true,
      ruc: "80012345-6",
      razon: "CLIENTE DE EJEMPLO S.A.",
      items: [
        { cant: "2", desc: "TORNILLO AUTOPERFORANTE 6x1", pu: 1500, valor: 3000, tasa: "10%" },
        { cant: "1", desc: "MARTILLO CARPINTERO 16oz", pu: 45000, valor: 45000, tasa: "10%" },
        { cant: "5", desc: "GUANTE DE TELA (EXENTO)", pu: 8000, valor: 40000, tasa: "EXENTA" },
      ],
      subtotal: 88000,
      totalPagar: 88000,
      liq5: 0,
      liq10: 4364,
      totalIva: 4364,
      printNumero,
    };
  } else {
    // Venta
    const vQ = await ctx.supabase
      .from("ventas")
      .select("id, numero_control, fecha, subtotal, monto_iva, total, metodo_pago, tipo_venta, cliente_id")
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (vQ.error) return new NextResponse(`Error: ${vQ.error.message}`, { status: 500 });
    if (!vQ.data) return new NextResponse("Venta no encontrada", { status: 404 });
    const venta = vQ.data as unknown as VentaRow;

    // Ítems
    const iQ = await ctx.supabase
      .from("ventas_items")
      .select("producto_nombre, cantidad, precio_venta, total_linea, tipo_iva, monto_iva")
      .eq("venta_id", id)
      .eq("empresa_id", empresaId);
    if (iQ.error) return new NextResponse(`Error ítems: ${iQ.error.message}`, { status: 500 });
    const itemsRaw = (iQ.data ?? []) as unknown as ItemRow[];

    // Cliente
    let ruc = "";
    let razon = "";
    if (venta.cliente_id) {
      const cQ = await ctx.supabase
        .from("clientes")
        .select("nombre, empresa, nombre_contacto, ruc, documento")
        .eq("id", venta.cliente_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      const c = cQ.data as ClienteRow | null;
      if (c) {
        const s = (v: string | null) => (typeof v === "string" && v.trim() ? v.trim() : "");
        razon = s(c.empresa) || s(c.nombre_contacto) || s(c.nombre);
        ruc = s(c.ruc) || s(c.documento);
      }
    }

    // Liquidación de IVA por tasa.
    let liq5 = 0;
    let liq10 = 0;
    const items = itemsRaw.map((it) => {
      const tasa = normTasa(it.tipo_iva);
      const mi = Number(it.monto_iva ?? 0);
      if (tasa === "5%") liq5 += mi;
      else if (tasa === "10%") liq10 += mi;
      return {
        cant: nf(Number(it.cantidad)),
        desc: it.producto_nombre ?? "",
        pu: Number(it.precio_venta),
        valor: Number(it.total_linea),
        tasa,
      };
    });

    const total = Number(venta.total);
    const esContado = (venta.tipo_venta ?? "").toLowerCase() !== "credito";

    data = {
      numero: venta.numero_control,
      fecha: fechaCorta(venta.fecha),
      esContado,
      ruc,
      razon,
      items,
      subtotal: total,
      totalPagar: total,
      liq5,
      liq10,
      totalIva: Number(venta.monto_iva),
      printNumero,
    };
  }

  const bloques = [renderBloque(0, data)];
  if (!soloIzquierda) bloques.push(renderBloque(DX_DUPLICADO, data));
  const guias = cal ? gridGuia(0) + (soloIzquierda ? "" : gridGuia(DX_DUPLICADO)) : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Factura preimpresa${demo ? " (DEMO)" : ""}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e5e5; }
  .hoja {
    position: relative;
    width: ${PAGE.w}mm;
    height: ${PAGE.h}mm;
    margin: 0 auto;
    background: #fff;
    overflow: hidden;
    font-family: "Courier New", ui-monospace, monospace;
    color: #000;
  }
  /* Todo el contenido se desplaza en bloque para calibrar (dx/dy) */
  .capa { position: absolute; left: ${dx}mm; top: ${dy}mm; width: 100%; height: 100%; }
  .d { position: absolute; white-space: nowrap; line-height: 1; }
  .g { position: absolute; }
  .barra {
    max-width: ${PAGE.w}mm; margin: 6mm auto; text-align: center; font-family: system-ui, sans-serif;
  }
  .barra button { padding: 8px 18px; font-size: 14px; cursor: pointer; border: 1px solid #333; border-radius: 6px; background: #fff; }
  .barra .hint { font-size: 12px; color: #555; margin-top: 6px; }
  @media print {
    html, body { background: #fff; }
    .hoja { margin: 0; }
    .barra { display: none; }
    .g { display: none; }
    @page { size: ${PAGE.w}mm ${PAGE.h}mm; margin: 0; }
  }
</style></head>
<body>
  <div class="hoja">
    <div class="capa">
      ${guias}
      ${bloques.join("\n")}
    </div>
  </div>
  <div class="barra">
    <button type="button" onclick="window.print()">Imprimir</button>
    <div class="hint">Calibración: agregá <code>?dx=1.5&dy=-2</code> (mm) a la URL para correr todo. <code>?cal=1</code> muestra la grilla guía. <code>?demo=1</code> datos de ejemplo.</div>
  </div>
  <script>
    try { if (new URL(location.href).searchParams.get('auto') === '1') setTimeout(function(){ window.print(); }, 300); } catch (e) {}
  </script>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
