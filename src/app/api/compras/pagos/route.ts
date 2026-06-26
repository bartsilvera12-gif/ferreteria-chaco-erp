import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET  /api/compras/pagos?numero_control=COMP-000123
 *   → lista de cuotas/pagos registrados para esa compra (ordenados por fecha).
 *
 * POST /api/compras/pagos
 *   body: { numero_control, monto, fecha_pago?, metodo?, nota? }
 *   → registra un pago validando que no exceda el saldo pendiente.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const url = new URL(request.url);
    const numero = url.searchParams.get("numero_control")?.trim();
    if (!numero) {
      return NextResponse.json(errorResponse("numero_control requerido."), { status: 400 });
    }

    const { data, error } = await supabase
      .from("compras_pagos")
      .select("id, numero_control, monto, fecha_pago, metodo, nota, created_at")
      .eq("empresa_id", auth.empresa_id)
      .eq("numero_control", numero)
      .order("fecha_pago", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });

    const numero = typeof body.numero_control === "string" ? body.numero_control.trim() : "";
    const monto = Number(body.monto);
    if (!numero) return NextResponse.json(errorResponse("numero_control requerido."), { status: 400 });
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    }

    const [compRes, pagRes] = await Promise.all([
      supabase
        .from("compras")
        .select("total, tipo_pago")
        .eq("empresa_id", auth.empresa_id)
        .eq("numero_control", numero),
      supabase
        .from("compras_pagos")
        .select("monto")
        .eq("empresa_id", auth.empresa_id)
        .eq("numero_control", numero),
    ]);
    if (compRes.error) return NextResponse.json(errorResponse(compRes.error.message), { status: 400 });
    if (pagRes.error) return NextResponse.json(errorResponse(pagRes.error.message), { status: 400 });

    const lineas = (compRes.data ?? []) as Array<{ total: number | string | null; tipo_pago: string | null }>;
    if (lineas.length === 0) {
      return NextResponse.json(errorResponse("Compra no encontrada."), { status: 404 });
    }
    if (lineas[0].tipo_pago !== "credito") {
      return NextResponse.json(errorResponse("Solo las compras a crédito admiten pagos."), { status: 400 });
    }

    const totalDoc = lineas.reduce((s, c) => s + Number(c.total ?? 0), 0);
    const pagado = ((pagRes.data ?? []) as Array<{ monto: number | string | null }>).reduce(
      (s, p) => s + Number(p.monto ?? 0),
      0,
    );
    const saldo = totalDoc - pagado;
    if (monto > saldo + 0.5) {
      return NextResponse.json(
        errorResponse(
          `El monto excede el saldo pendiente (Gs. ${Math.round(saldo).toLocaleString("es-PY")}).`,
        ),
        { status: 400 },
      );
    }

    const fechaPago = typeof body.fecha_pago === "string" && body.fecha_pago.trim() ? body.fecha_pago.trim() : null;
    const metodo = typeof body.metodo === "string" && body.metodo.trim() ? body.metodo.trim() : null;
    const nota = typeof body.nota === "string" && body.nota.trim() ? body.nota.trim() : null;

    const insertRow: Record<string, unknown> = {
      empresa_id: auth.empresa_id,
      numero_control: numero,
      monto,
      metodo,
      nota,
      created_by: auth.user.id,
    };
    if (fechaPago) insertRow.fecha_pago = fechaPago;

    const { data, error } = await supabase
      .from("compras_pagos")
      .insert(insertRow)
      .select("id, numero_control, monto, fecha_pago, metodo, nota, created_at")
      .single();

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
