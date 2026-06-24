import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/middleware/require-module";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getCajasAbiertasPg } from "@/lib/caja/server/caja-pg";
import { successResponse, errorResponse } from "@/lib/api/response";

/**
 * GET /api/caja/abierta — multi-caja: devuelve todas las cajas abiertas de la
 * empresa (hasta 3 concurrentes, una por estación numero_caja 1/2/3).
 *
 * Respuesta: `{ cajas: Caja[], caja: Caja | null }`. El campo `caja` (la primera
 * de la lista) se mantiene para compat con UIs que esperaban una sola.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireModule(request, "ventas");
    if (!gate.ok) return NextResponse.json(errorResponse(gate.error), { status: gate.status });
    const auth = gate.auth;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const cajas = await getCajasAbiertasPg(schema, auth.empresa_id);
    return NextResponse.json(successResponse({ cajas, caja: cajas[0] ?? null }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo obtener la caja.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
