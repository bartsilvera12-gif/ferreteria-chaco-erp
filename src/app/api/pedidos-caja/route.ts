import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { mapPedidoCaja, PEDIDO_CAJA_COLS } from "@/lib/pedidos-caja/server";

/**
 * GET /api/pedidos-caja?estado=pendiente&mios=1
 *
 * - sin params  → todos los pendientes de la empresa (vista cajero).
 * - estado=...  → filtra por estado (pendiente/facturado/cancelado/todos).
 * - mios=1      → solo los del usuario actual (vista vendedor).
 *
 * POST /api/pedidos-caja
 *   Body: { cliente_id?, cliente_nombre?, cliente_telefono?, observacion?, items: [...] }
 *   Crea un pedido en estado 'pendiente'.
 */

interface BodyItem {
  producto_id: string;
  producto_nombre: string;
  sku?: string | null;
  cantidad: number;
  precio_venta: number;
  tipo_precio?: "minorista" | "mayorista" | null;
}

interface PostBody {
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  observacion?: string | null;
  items: BodyItem[];
  /** A qué caja (1/2/3) se manda el pedido. Opcional. */
  caja_destino_numero?: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase: sb, auth } = ctx;
    const empresaId = auth.empresa_id;

    const url = new URL(request.url);
    const estadoParam = url.searchParams.get("estado") ?? "pendiente";
    const mios = url.searchParams.get("mios") === "1";

    let q = sb
      .from("pedidos_caja")
      .select(PEDIDO_CAJA_COLS)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (estadoParam !== "todos") q = q.eq("estado", estadoParam);
    if (mios && auth.usuarioCatalogId) q = q.eq("armado_por_id", auth.usuarioCatalogId);
    const cajaParam = url.searchParams.get("caja_destino_numero");
    if (cajaParam) {
      const n = parseInt(cajaParam, 10);
      if (n >= 1 && n <= 3) q = q.eq("caja_destino_numero", n);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const pedidos = (((data ?? []) as unknown) as Record<string, unknown>[]).map(mapPedidoCaja);
    return NextResponse.json(successResponse({ pedidos }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudieron cargar los pedidos.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase: sb, auth } = ctx;
    const empresaId = auth.empresa_id;

    const body = (await request.json().catch(() => null)) as PostBody | null;
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(errorResponse("Agregá al menos un producto al pedido."), { status: 400 });
    }

    const items = body.items
      .filter((it) => it && it.producto_id && Number(it.cantidad) > 0)
      .map((it) => ({
        producto_id: String(it.producto_id),
        producto_nombre: String(it.producto_nombre ?? ""),
        sku: it.sku ?? null,
        cantidad: Number(it.cantidad),
        precio_venta: Math.max(0, Number(it.precio_venta) || 0),
        tipo_precio: it.tipo_precio === "mayorista" ? "mayorista" : "minorista",
      }));
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Los productos no son válidos (cantidad debe ser > 0)."), { status: 400 });
    }

    const totalEstimado = items.reduce((s, it) => s + it.cantidad * it.precio_venta, 0);
    const clienteNombre = (body.cliente_nombre ?? "").trim() || null;
    const titulo = clienteNombre
      ? `Pedido ${clienteNombre}`
      : `Pedido (${items.length} producto${items.length === 1 ? "" : "s"})`;

    const cajaDestino =
      typeof body.caja_destino_numero === "number" &&
      Number.isInteger(body.caja_destino_numero) &&
      body.caja_destino_numero >= 1 &&
      body.caja_destino_numero <= 3
        ? body.caja_destino_numero
        : null;

    const ins = await sb
      .from("pedidos_caja")
      .insert({
        empresa_id: empresaId,
        titulo,
        cliente_id: body.cliente_id || null,
        cliente_nombre: clienteNombre,
        cliente_telefono: (body.cliente_telefono ?? "").trim() || null,
        observacion: (body.observacion ?? "").trim() || null,
        items,
        total_estimado: totalEstimado,
        estado: "pendiente",
        caja_destino_numero: cajaDestino,
        armado_por_id: auth.usuarioCatalogId ?? null,
        armado_por_email: auth.user?.email ?? null,
      })
      .select(PEDIDO_CAJA_COLS)
      .single();
    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json(successResponse({ pedido: mapPedidoCaja((ins.data as unknown) as Record<string, unknown>) }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear el pedido.";
    console.error("[/api/pedidos-caja POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
