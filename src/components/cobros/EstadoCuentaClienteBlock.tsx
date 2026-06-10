"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { RegistrarCobroModalCxc, type CxcRef } from "@/components/cobros/RegistrarCobroModalCxc";

type Mov = {
  id: string;
  numero_venta: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  total: number;
  cobrado: number;
  saldo: number;
  estado: string;
  vencida: boolean;
};
type Resumen = { total_vendido: number; saldo_pendiente: number; total_cobrado: number; vencido: number };

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  parcial: "bg-sky-100 text-sky-700",
  pagado: "bg-emerald-100 text-emerald-700",
  vencido: "bg-red-100 text-red-700",
  anulado: "bg-slate-100 text-slate-500",
};
const FILTROS = [
  { id: "pendientes", label: "Pendientes" },
  { id: "parciales", label: "Parciales" },
  { id: "pagadas", label: "Pagadas" },
  { id: "vencidas", label: "Vencidas" },
  { id: "todas", label: "Todas" },
] as const;
type FiltroId = (typeof FILTROS)[number]["id"];

function fmtGs(n: number) {
  return "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");
}
function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

/**
 * Bloque de Estado de cuenta del cliente basado en cuentas_por_cobrar/cobros_clientes.
 * Reutilizable (Gestión de Clientes, etc.). Registra cobros con el mismo flujo de /pagos.
 */
export function EstadoCuentaClienteBlock({
  clienteId,
  onCambio,
}: {
  clienteId: string;
  onCambio?: () => void;
}) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroId>("pendientes");
  const [cobrando, setCobrando] = useState<CxcRef | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/estado-cuenta`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || body?.success === false) {
        setError(body?.error ?? "No se pudo cargar el estado de cuenta.");
        return;
      }
      setResumen(body.data.resumen);
      setMovs((body.data.movimientos ?? []) as Mov[]);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    switch (filtro) {
      case "pendientes": return movs.filter((m) => m.estado === "pendiente");
      case "parciales": return movs.filter((m) => m.estado === "parcial");
      case "pagadas": return movs.filter((m) => m.estado === "pagado");
      case "vencidas": return movs.filter((m) => m.vencida && m.estado !== "pagado" && m.estado !== "anulado");
      case "todas": return movs;
      default: return movs;
    }
  }, [movs, filtro]);

  const sinCuentas = !loading && movs.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">✓ {toast}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4FAEB2]">Cobranzas</span>
          <h3 className="text-sm font-semibold text-slate-700">Estado de cuenta</h3>
        </div>
        <a
          href={`/api/clientes/${clienteId}/estado-cuenta/pdf?auto=1`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Descargar estado de cuenta
        </a>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Vendido a crédito</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{fmtGs(resumen.total_vendido)}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-emerald-600">Cobrado</div>
            <div className="mt-0.5 text-lg font-bold text-emerald-700">{fmtGs(resumen.total_cobrado)}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-amber-600">Saldo pendiente</div>
            <div className="mt-0.5 text-lg font-bold text-amber-700">{fmtGs(resumen.saldo_pendiente)}</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-red-500">Vencido</div>
            <div className="mt-0.5 text-lg font-bold text-red-700">{fmtGs(resumen.vencido)}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {!sinCuentas && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filtro === f.id ? "bg-[#4FAEB2] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="m-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="p-8 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : sinCuentas ? (
        <div className="p-8 text-center text-sm text-gray-500">El cliente no tiene cuentas pendientes.</div>
      ) : visibles.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">No hay cuentas en este filtro.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2.5 px-4 font-medium">Venta</th>
                <th className="py-2.5 px-4 font-medium">Emisión</th>
                <th className="py-2.5 px-4 font-medium">Vencimiento</th>
                <th className="py-2.5 px-4 font-medium text-right">Total</th>
                <th className="py-2.5 px-4 font-medium text-right">Cobrado</th>
                <th className="py-2.5 px-4 font-medium text-right">Saldo</th>
                <th className="py-2.5 px-4 font-medium">Estado</th>
                <th className="py-2.5 px-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-medium text-gray-800">{m.numero_venta ?? "—"}</td>
                  <td className="py-2.5 px-4 text-gray-600">{fmtFecha(m.fecha_emision)}</td>
                  <td className={`py-2.5 px-4 ${m.vencida ? "font-semibold text-red-600" : "text-gray-600"}`}>{fmtFecha(m.fecha_vencimiento)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{fmtGs(m.total)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700">{fmtGs(m.cobrado)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-amber-600">{fmtGs(m.saldo)}</td>
                  <td className="py-2.5 px-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[m.vencida && m.estado !== "pagado" ? "vencido" : m.estado] ?? ESTADO_BADGE.pendiente}`}>
                      {m.vencida && m.estado !== "pagado" ? "Vencido" : m.estado.charAt(0).toUpperCase() + m.estado.slice(1)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {m.estado === "pagado" || m.estado === "anulado" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <button
                        onClick={() => setCobrando({ id: m.id, numero_venta: m.numero_venta, saldo: m.saldo })}
                        className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
                      >
                        Registrar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RegistrarCobroModalCxc
        open={!!cobrando}
        cuenta={cobrando}
        onClose={() => setCobrando(null)}
        onExito={async () => {
          setToast("Pago registrado");
          setTimeout(() => setToast(null), 2800);
          await cargar();
          onCambio?.();
        }}
      />
    </section>
  );
}
