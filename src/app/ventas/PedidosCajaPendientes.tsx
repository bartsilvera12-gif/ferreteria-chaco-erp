"use client";

/**
 * Lista los pedidos pendientes enviados desde /consulta a una caja específica.
 * Cada cajero ve solo los que apuntan a SU caja (filtro por `caja_destino_numero`).
 * Al hacer click se abre /ventas/nueva?pedido_caja_id=X con los items precargados.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send, Clock } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getCajasAbiertas } from "@/lib/caja/storage";

type Pedido = {
  id: string;
  titulo: string;
  cliente_nombre: string | null;
  total_estimado: number;
  caja_destino_numero: number | null;
  items_count: number;
  created_at: string | null;
};

function fmtGs(v: number) {
  return `Gs. ${Math.round(v || 0).toLocaleString("es-PY")}`;
}

export default function PedidosCajaPendientes() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cajasAbiertas, setCajasAbiertas] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const cajas = await getCajasAbiertas();
        if (cancel) return;
        const nums = cajas.map((c) => c.numero_caja).sort();
        setCajasAbiertas(nums);

        const r = await fetchWithSupabaseSession("/api/pedidos-caja?estado=pendiente", { cache: "no-store" });
        const j = await r.json();
        if (cancel) return;
        if (!j?.success) { setPedidos([]); return; }
        const raw = (j.data?.pedidos ?? []) as Array<Record<string, unknown>>;
        setPedidos(raw.map((p) => ({
          id: String(p.id),
          titulo: String(p.titulo ?? ""),
          cliente_nombre: p.cliente_nombre ? String(p.cliente_nombre) : null,
          total_estimado: Number(p.total_estimado) || 0,
          caja_destino_numero: p.caja_destino_numero == null ? null : Number(p.caja_destino_numero),
          items_count: Array.isArray(p.items) ? (p.items as unknown[]).length : 0,
          created_at: p.created_at ? String(p.created_at) : null,
        })));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (loading || pedidos.length === 0) return null;

  const pedidosVisibles = cajasAbiertas.length > 0
    ? pedidos.filter((p) => p.caja_destino_numero == null || cajasAbiertas.includes(p.caja_destino_numero))
    : pedidos;

  if (pedidosVisibles.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-900">
          Pedidos pendientes de Consulta · {pedidosVisibles.length}
        </h2>
      </div>
      <p className="mt-0.5 text-xs text-amber-700">Click en un pedido para facturarlo en la caja correspondiente.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pedidosVisibles.map((p) => (
          <Link
            key={p.id}
            href={`/ventas/nueva?pedido_caja_id=${encodeURIComponent(p.id)}`}
            className="block rounded-lg border border-amber-200 bg-white px-3 py-2.5 hover:border-amber-400 hover:bg-amber-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{p.titulo}</p>
                {p.cliente_nombre && (
                  <p className="text-[11px] text-slate-500 truncate">{p.cliente_nombre}</p>
                )}
              </div>
              {p.caja_destino_numero && (
                <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Caja {p.caja_destino_numero}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">{p.items_count} item(s)</span>
              <span className="font-bold tabular-nums text-slate-900">{fmtGs(p.total_estimado)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />
              <span>{p.created_at ? new Date(p.created_at).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
