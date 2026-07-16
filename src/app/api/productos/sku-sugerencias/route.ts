import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/productos/sku-sugerencias?tipo=<reventa|menu|materia>
 *
 * Devuelve:
 *  - sugerido: SKU autogenerado para el tipo (REV/MEN/MP) con el próximo número.
 *  - patrones: prefijos detectados en SKUs existentes + los por tipo, cada uno
 *    con su "siguiente" (próximo número), para el dropdown "Usar patrón existente".
 * Solo lectura sobre productos.sku. No toca ventas/compras.
 */

const PREFIJO_TIPO: Record<string, string> = { reventa: "REV", menu: "MEN", materia: "MP" };

function pad(n: number, width: number): string {
  return String(n).padStart(Math.max(width, 1), "0");
}

/** Separa "QA-MAY-001" → {prefix:"QA-MAY", num:1, width:3}. Si no hay número final, null. */
function parseSku(sku: string): { prefix: string; num: number; width: number } | null {
  const m = /^(.+?)[-_](\d+)$/.exec(sku.trim());
  if (!m) return null;
  return { prefix: m[1], num: parseInt(m[2], 10) || 0, width: m[2].length };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const tipo = (new URL(request.url).searchParams.get("tipo") ?? "reventa").toLowerCase();
    const prefijoTipo = PREFIJO_TIPO[tipo] ?? "REV";

    const { data, error } = await ctx.supabase
      .from("productos")
      .select("sku")
      .eq("empresa_id", ctx.auth.empresa_id);
    if (error) throw new Error(error.message);

    // Set global de SKUs existentes (case-insensitive) para validar colisiones.
    const skusExistentes = new Set<string>();
    for (const r of (data ?? []) as Array<{ sku: string | null }>) {
      if (r.sku) skusExistentes.add(r.sku.trim().toUpperCase());
    }

    // prefix -> { usados:Set<number>, maxNum, width }
    const map = new Map<string, { usados: Set<number>; maxNum: number; width: number }>();
    for (const r of (data ?? []) as Array<{ sku: string | null }>) {
      const p = r.sku ? parseSku(r.sku) : null;
      if (!p) continue;
      const cur = map.get(p.prefix);
      if (!cur) map.set(p.prefix, { usados: new Set([p.num]), maxNum: p.num, width: p.width });
      else {
        cur.usados.add(p.num);
        cur.maxNum = Math.max(cur.maxNum, p.num);
        cur.width = Math.max(cur.width, p.width);
      }
    }

    // Asegurar que los 3 prefijos por tipo existan en la lista (aunque no se hayan usado).
    for (const px of Object.values(PREFIJO_TIPO)) {
      if (!map.has(px)) map.set(px, { usados: new Set(), maxNum: 0, width: 4 });
    }

    /** Devuelve el próximo número libre para un prefix — evita colisiones aunque
     *  el maxNum haya quedado desactualizado (soft-deletes, imports manuales). */
    function proximoLibre(prefix: string, usados: Set<number>, maxNum: number, width: number): string {
      let n = maxNum + 1;
      const w = Math.max(width, 4);
      while (usados.has(n) || skusExistentes.has(`${prefix}-${pad(n, w)}`.toUpperCase())) {
        n += 1;
        if (n > maxNum + 100_000) break; // guardarail
      }
      return `${prefix}-${pad(n, w)}`;
    }

    const patrones = [...map.entries()]
      .map(([prefix, v]) => ({
        prefix,
        siguiente: proximoLibre(prefix, v.usados, v.maxNum, v.width),
      }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));

    const def = map.get(prefijoTipo) ?? { usados: new Set<number>(), maxNum: 0, width: 4 };
    const sugerido = proximoLibre(prefijoTipo, def.usados, def.maxNum, def.width);

    return NextResponse.json(successResponse({ sugerido, prefijo_tipo: prefijoTipo, patrones }));
  } catch (err) {
    console.error("[/api/productos/sku-sugerencias]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron generar sugerencias de SKU."), { status: 500 });
  }
}
