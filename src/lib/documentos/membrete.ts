/**
 * Membrete (encabezado) común para todos los documentos imprimibles del ERP.
 * Devuelve HTML con estilos inline para no depender del CSS de cada endpoint
 * (evita duplicar el markup del encabezado en cada documento).
 *
 * SOLO presentación: no toca datos de negocio. Los datos comerciales son fijos
 * de la empresa (Ferretería Chaco).
 */

export const EMPRESA_DOC = {
  nombre: "Ferretería Chaco",
  actividad: [] as string[],
  telefono: "",
  direccion: [] as string[],
  logoUrl: "",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Membrete A4: logo a la izquierda, datos comerciales a la derecha, línea divisoria.
 * `origin` opcional para URL absoluta del logo (útil al imprimir/guardar PDF).
 */
export function membreteA4(_origin = ""): string {
  const e = EMPRESA_DOC;
  return `
  <div style="border-bottom:2px solid #2E7D32;padding-bottom:12px;margin-bottom:16px;font-size:11px;color:#374151;line-height:1.55;">
    <div style="font-size:16px;font-weight:800;color:#1f2937;">${esc(e.nombre)}</div>
    ${e.actividad.map((a) => `<div style="color:#6b7280;">${esc(a)}</div>`).join("")}
    <div style="margin-top:4px;"><strong>Tel:</strong> ${esc(e.telefono)}</div>
    <div>${e.direccion.map(esc).join(" · ")}</div>
  </div>`;
}

/**
 * Membrete compacto para ticket angosto (58/80mm): logo arriba, datos centrados.
 */
export function membreteTicket(_origin = ""): string {
  const e = EMPRESA_DOC;
  return `
  <div style="text-align:center;padding-bottom:6px;margin-bottom:6px;border-bottom:1px dashed #000;">
    <div style="font-weight:700;font-size:13px;">${esc(e.nombre)}</div>
    <div style="font-size:10px;">Tel: ${esc(e.telefono)}</div>
    <div style="font-size:10px;">${esc(e.direccion[0])}</div>
    <div style="font-size:10px;">${esc(e.direccion.slice(1).join(" · "))}</div>
  </div>`;
}
