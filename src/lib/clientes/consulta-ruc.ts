/**
 * Consulta de RUC en fuentes públicas de Paraguay (SET / DNIT / mirrors).
 *
 * Estado actual: el portal del SET migró a DNIT y los endpoints públicos que
 * históricamente devolvían JSON (`consultaRUCServlet`, `consultaRUCAJAXServlet`)
 * hoy responden 404. Hasta que DNIT publique una API estable, este módulo
 * intenta varios proveedores en orden y devuelve el primero que responde con
 * datos válidos. Si ninguno responde, retorna `{ found: false }`.
 *
 * Para producción robusta el usuario puede agregar la env var `RUC_LOOKUP_URL`
 * apuntando a un servicio propio o de terceros (ej. ruc.com.py). El endpoint
 * esperado: GET {URL}?ruc={ruc} → JSON `{ ruc, nombre, estado? }`.
 */

export type RucLookupResult =
  | { found: true; ruc: string; nombre: string; estado: string | null; fuente: string }
  | { found: false; intentadas: string[] };

const TIMEOUT_MS = 6000;

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 NeuraERP/1.0", Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickName(obj: unknown): { nombre: string; estado: string | null } | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const nombre =
    (typeof o.razon_social === "string" && o.razon_social) ||
    (typeof o.razonSocial === "string" && o.razonSocial) ||
    (typeof o.nombre === "string" && o.nombre) ||
    (typeof o.name === "string" && o.name) ||
    null;
  if (!nombre) return null;
  const estado =
    (typeof o.estado === "string" && o.estado) ||
    (typeof o.status === "string" && o.status) ||
    null;
  return { nombre: nombre.trim(), estado };
}

export async function consultarRucPublico(rucRaw: string): Promise<RucLookupResult> {
  const ruc = rucRaw.replace(/[^0-9\-]/g, "").trim();
  if (!ruc) return { found: false, intentadas: [] };

  const proveedores: { url: string; fuente: string }[] = [];

  const overrideUrl = process.env.RUC_LOOKUP_URL?.trim();
  if (overrideUrl) {
    proveedores.push({
      url: `${overrideUrl}${overrideUrl.includes("?") ? "&" : "?"}ruc=${encodeURIComponent(ruc)}`,
      fuente: "configurado",
    });
  }

  proveedores.push(
    { url: `https://api.factuy.com/v1/ruc/${encodeURIComponent(ruc)}`,        fuente: "factuy" },
    { url: `https://ruc.com.py/api/ruc/${encodeURIComponent(ruc)}`,           fuente: "ruc.com.py" },
  );

  const intentadas: string[] = [];
  for (const p of proveedores) {
    intentadas.push(p.fuente);
    const data = await fetchJson(p.url);
    const parsed = pickName(data);
    if (parsed) {
      return { found: true, ruc, nombre: parsed.nombre, estado: parsed.estado, fuente: p.fuente };
    }
  }
  return { found: false, intentadas };
}
