/**
 * Consulta de RUC contra el servicio oficial DNIT (ex SET).
 *
 * Reglas:
 *  - Acepta el RUC con o sin guion (`80014066-1` o `800140661`). Se intenta
 *    separar el dígito verificador del cuerpo; si el formato no es interpretable
 *    se delega al proveedor.
 *  - La API key vive SOLO en `process.env.DNIT_CONSULTA_PUBLICA_API_KEY`
 *    (server-only). NUNCA se expone en bundles cliente.
 *  - Si no hay API key configurada, devuelve `apiKeyMissing: true` para que la
 *    UI degrade limpio a carga manual.
 *  - La URL del servicio se puede sobreescribir con `DNIT_CONSULTA_RUC_URL`.
 *    Default: el endpoint público anunciado por DNIT en su portal.
 */

export type DnitLookupResult =
  | {
      found: true;
      ruc: string;
      dv: string | null;
      ruc_completo: string;
      razon_social: string;
      nombre_comercial: string | null;
      estado: string | null;
      fuente: "dnit";
    }
  | { found: false; reason: "not_found" | "service_down" | "api_key_missing" | "invalid_ruc"; mensaje: string };

const TIMEOUT_MS = 8000;
const DEFAULT_DNIT_URL =
  process.env.DNIT_CONSULTA_RUC_URL?.trim() ||
  "https://servicios.set.gov.py/eset-publico/consultaRUCAJAXServlet";

/** Normaliza un RUC tipeado por el usuario. Acepta `12345678`, `12345678-9`, `12345678 - 9`. */
export function parseRuc(input: string): { ruc: string; dv: string | null; rucCompleto: string } | null {
  const clean = input.replace(/\s+/g, "").trim();
  if (!clean) return null;
  const m = clean.match(/^(\d{1,11})(?:-(\d))?$/);
  if (!m) return null;
  const ruc = m[1];
  const dv = m[2] ?? null;
  return { ruc, dv, rucCompleto: dv ? `${ruc}-${dv}` : ruc };
}

function pick<T extends Record<string, unknown>>(obj: T, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export async function consultarDnitRuc(rucInput: string): Promise<DnitLookupResult> {
  const parsed = parseRuc(rucInput);
  if (!parsed) {
    return { found: false, reason: "invalid_ruc", mensaje: "Formato de RUC inválido. Usá dígitos opcionalmente con guion." };
  }

  const apiKey = process.env.DNIT_CONSULTA_PUBLICA_API_KEY?.trim();
  if (!apiKey) {
    return {
      found: false,
      reason: "api_key_missing",
      mensaje: "Consulta DNIT no configurada. Cargá los datos del cliente manualmente.",
    };
  }

  const url = `${DEFAULT_DNIT_URL}${DEFAULT_DNIT_URL.includes("?") ? "&" : "?"}ruc=${encodeURIComponent(parsed.ruc)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 FerreteriaChaco/1.0",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Api-Key": apiKey,
      },
    });
    if (!res.ok) {
      return { found: false, reason: "service_down", mensaje: "DNIT respondió error. Cargá los datos manualmente o reintentá más tarde." };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("json")) {
      return { found: false, reason: "service_down", mensaje: "DNIT devolvió un formato inesperado. Cargá los datos manualmente." };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const razon = pick(data, "razon_social", "razonSocial", "nombre", "name");
    if (!razon) {
      return { found: false, reason: "not_found", mensaje: "El RUC no aparece en DNIT. Verificá el número o cargá los datos manualmente." };
    }
    const nombreComercial = pick(data, "nombre_comercial", "nombreFantasia", "fantasia");
    const estado = pick(data, "estado", "estadoContribuyente", "status");
    const dv = parsed.dv ?? (pick(data, "dv", "digito_verificador", "digitoVerificador") || null);
    return {
      found: true,
      ruc: parsed.ruc,
      dv,
      ruc_completo: dv ? `${parsed.ruc}-${dv}` : parsed.ruc,
      razon_social: razon.toUpperCase(),
      nombre_comercial: nombreComercial ? nombreComercial.toUpperCase() : null,
      estado,
      fuente: "dnit",
    };
  } catch {
    return { found: false, reason: "service_down", mensaje: "No se pudo contactar con DNIT. Cargá los datos manualmente." };
  } finally {
    clearTimeout(t);
  }
}
