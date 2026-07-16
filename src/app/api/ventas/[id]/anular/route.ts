import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/ventas/[id]/anular
 *
 * Marca la venta como `estado='anulada'`, reversa el stock descontado (por cada
 * ítem crea un movimiento tipo ENTRADA origen='anulacion' y suma stock_actual)
 * y elimina la cuenta_por_cobrar generada si era crédito.
 *
 * No borra la venta ni sus ítems: mantiene trazabilidad completa. Es idempotente:
 * si la venta ya está anulada, devuelve 200 sin volver a reversar.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ventaId } = await ctxParams.params;
    if (!ventaId) return NextResponse.json(errorResponse("id obligatorio."), { status: 400 });

    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase: sb, auth } = ctx;
    const empresaId = auth.empresa_id;

    let motivo: string | null = null;
    try {
      const body = (await request.json().catch(() => null)) as { motivo?: string } | null;
      if (body?.motivo && typeof body.motivo === "string") motivo = body.motivo.trim().slice(0, 500);
    } catch { /* body opcional */ }

    // 1) Cargar la venta.
    const vQ = await sb
      .from("ventas")
      .select("id, estado, tipo_venta, numero_control, fecha")
      .eq("empresa_id", empresaId)
      .eq("id", ventaId)
      .maybeSingle();
    if (vQ.error) throw new Error(vQ.error.message);
    if (!vQ.data) return NextResponse.json(errorResponse("Venta no encontrada."), { status: 404 });
    const venta = vQ.data as { id: string; estado: string; tipo_venta: string; numero_control: string; fecha: string };
    if (venta.estado === "anulada") {
      return NextResponse.json(successResponse({ ok: true, ya_anulada: true }));
    }

    // 2) Reversar stock: por cada ítem con controla_stock, ENTRADA por cantidad.
    const itemsQ = await sb
      .from("ventas_items")
      .select("producto_id, producto_nombre, sku, cantidad, costo_unitario")
      .eq("empresa_id", empresaId)
      .eq("venta_id", ventaId);
    if (itemsQ.error) throw new Error(itemsQ.error.message);
    const items = (itemsQ.data ?? []) as Array<{
      producto_id: string;
      producto_nombre: string | null;
      sku: string | null;
      cantidad: number | string;
      costo_unitario: number | string | null;
    }>;

    const fechaIso = new Date().toISOString();
    for (const it of items) {
      const cant = Number(it.cantidad);
      if (!Number.isFinite(cant) || cant <= 0) continue;

      const prodQ = await sb
        .from("productos")
        .select("stock_actual, controla_stock")
        .eq("id", it.producto_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (prodQ.error || !prodQ.data) continue;
      const p = prodQ.data as { stock_actual: number | string; controla_stock?: boolean };
      const controla = p.controla_stock !== false;
      if (!controla) continue;

      const stockActual = Number(p.stock_actual) || 0;
      const nuevoStock = stockActual + cant;
      const updProd = await sb
        .from("productos")
        .update({ stock_actual: nuevoStock })
        .eq("id", it.producto_id)
        .eq("empresa_id", empresaId);
      if (updProd.error) throw new Error(updProd.error.message);

      const insMov = await sb.from("movimientos_inventario").insert({
        empresa_id: empresaId,
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre,
        producto_sku: it.sku,
        tipo: "ENTRADA",
        cantidad: cant,
        costo_unitario: Number(it.costo_unitario) || 0,
        origen: "anulacion",
        referencia: `ANUL-${venta.numero_control}`,
        fecha: fechaIso,
        venta_id: ventaId,
      });
      if (insMov.error) {
        console.error("[/api/ventas/[id]/anular] mov ENTRADA fallo", insMov.error.message);
      }
    }

    // 3) Borrar cuenta_por_cobrar asociada (si era crédito).
    if (venta.tipo_venta === "CREDITO") {
      await sb.from("cuentas_por_cobrar").delete().eq("empresa_id", empresaId).eq("venta_id", ventaId);
    }

    // 4) Marcar la venta como anulada + observación de motivo.
    const upd = await sb
      .from("ventas")
      .update({
        estado: "anulada",
        observaciones: motivo ? `[ANULADA ${new Date().toISOString().slice(0, 10)}] ${motivo}` : null,
      })
      .eq("id", ventaId)
      .eq("empresa_id", empresaId);
    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/ventas/[id]/anular]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo anular la venta."), { status: 500 });
  }
}
