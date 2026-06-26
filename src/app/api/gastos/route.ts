import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/gastos
 * Gastos operativos del tenant (service role).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/gastos
 * Crea un gasto. empresa_id se resuelve server-side desde la sesión —
 * evita el problema de getCurrentUser() client-side cuando PostgREST
 * tiene el schema cacheado o hay un retardo de sesión.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    }
    const tipo = body.tipo === "fijo" ? "fijo" : "variable";
    const categoria = typeof body.categoria === "string" && body.categoria.trim() ? body.categoria.trim() : null;
    const descripcion = typeof body.descripcion === "string" && body.descripcion.trim() ? body.descripcion.trim() : null;
    const recurrente = body.recurrente === true;
    const frecuencia = typeof body.frecuencia === "string" && body.frecuencia.trim() ? body.frecuencia.trim() : null;
    const fecha = typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : null;
    if (!fecha) {
      return NextResponse.json(errorResponse("Fecha obligatoria."), { status: 400 });
    }

    const { data, error } = await supabase
      .from("gastos")
      .insert({
        empresa_id: auth.empresa_id,
        categoria,
        descripcion,
        monto,
        tipo,
        recurrente,
        frecuencia,
        fecha,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ gasto: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
