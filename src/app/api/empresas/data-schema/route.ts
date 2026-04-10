import { NextResponse } from "next/server";
import { resolveApiAuthContext } from "@/lib/middleware/api-auth-context";
import { SUPABASE_APP_SCHEMA, resolveEmpresaDataSchema } from "@/lib/supabase/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/data-schema
 * Devuelve el schema PostgREST donde viven las tablas de negocio de la empresa autenticada.
 * Auth: anon + JWT (cookies o Authorization Bearer). Lectura empresas.data_schema vía RLS (sin service role).
 */
export async function GET(request: Request) {
  const r = await resolveApiAuthContext(request, { forDataSchemaEndpoint: true });
  if (!r.ok) {
    return NextResponse.json({ error: "No autorizado", code: r.code }, { status: 401 });
  }

  if (r.ctx.empresa_id === null) {
    return NextResponse.json({ schema: SUPABASE_APP_SCHEMA });
  }

  const { data: erows, error: eErr } = await r.ctx.userScopedSupabase
    .from("empresas")
    .select("data_schema")
    .eq("id", r.ctx.empresa_id)
    .limit(1);

  if (eErr) {
    return NextResponse.json(
      { error: "No se pudo leer configuración de empresa", code: "empresas_fetch_error" },
      { status: 502 }
    );
  }

  const raw = (erows?.[0] as { data_schema?: string | null } | undefined)?.data_schema;
  const schema = resolveEmpresaDataSchema(raw);

  return NextResponse.json({ schema });
}
