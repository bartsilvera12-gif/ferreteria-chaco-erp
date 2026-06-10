"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Banknote, Download } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

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
type Cobro = { id: string; fecha_pago: string; monto: number; metodo_pago: string; referencia: string | null };
type Cliente = { id: string; nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
type Resumen = { total_vendido: number; saldo_pendiente: number; total_cobrado: number; vencido: number };

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  parcial: "bg-sky-100 text-sky-700",
  pagado: "bg-emerald-100 text-emerald-700",
  vencido: "bg-red-100 text-red-700",
  anulado: "bg-slate-100 text-slate-500",
};
const METODOS = ["efectivo", "transferencia", "tarjeta", "otro"] as const;

function fmtGs(n: number) {
  return "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");
}
function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function EstadoCuentaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [cobrando, setCobrando] = useState<Mov | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithSupabaseSession(`/api/clientes/${id}/estado-cuenta`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || body?.success === false) {
        setError(body?.error ?? "No se pudo cargar el estado de cuenta.");
        return;
      }
      setCliente(body.data.cliente);
      setResumen(body.data.resumen);
      setMovs(body.data.movimientos ?? []);
      setCobros(body.data.cobros ?? []);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrirCobro(m: Mov) {
    setCobrando(m);
    setMonto(String(m.saldo));
    setMetodo("efectivo");
    setReferencia("");
    setErrorCobro(null);
  }

  async function registrarCobro() {
    if (!cobrando || guardando) return;
    const mn = Number(monto);
    if (!(mn > 0)) { setErrorCobro("El monto debe ser mayor a cero."); return; }
    if (mn > cobrando.saldo + 0.001) { setErrorCobro("El monto supera el saldo pendiente."); return; }
    setGuardando(true);
    setErrorCobro(null);
    try {
      const res = await fetchWithSupabaseSession("/api/cobros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta_por_cobrar_id: cobrando.id, monto: mn, metodo_pago: metodo, referencia: referencia.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok || body?.success === false) {
        setErrorCobro(body?.error ?? "No se pudo registrar el cobro.");
        return;
      }
      setCobrando(null);
      setToast("Cobro registrado");
      setTimeout(() => setToast(null), 2800);
      await cargar();
    } catch {
      setErrorCobro("Error de red.");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>;
  }
  if (!cliente || !resumen) {
    return (
      <div className="p-6 space-y-3">
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error ?? "Cliente no encontrado"}</div>
        <Link href="/clientes" className="text-sm text-[#4FAEB2] hover:underline">Volver a clientes</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">✓ {toast}</div>
      )}

      <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Banknote className="h-7 w-7 text-[#4FAEB2]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Estado de cuenta</h1>
            <p className="text-gray-600">{cliente.nombre}{cliente.ruc ? ` · ${cliente.ruc}` : ""}</p>
          </div>
        </div>
        <a
          href={`/api/clientes/${id}/estado-cuenta/pdf?auto=1`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Descargar estado de cuenta
        </a>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-400">Total vendido</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{fmtGs(resumen.total_vendido)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-emerald-600">Cobrado</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{fmtGs(resumen.total_cobrado)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-amber-600">Saldo pendiente</div>
          <div className="mt-1 text-xl font-bold text-amber-700">{fmtGs(resumen.saldo_pendiente)}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-red-500">Vencido</div>
          <div className="mt-1 text-xl font-bold text-red-700">{fmtGs(resumen.vencido)}</div>
        </div>
      </div>

      {/* Movimientos (créditos) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-700">Cuentas a crédito</h2></div>
        {movs.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Este cliente no tiene ventas a crédito.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
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
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-4 font-mono font-medium text-gray-800">{m.numero_venta ?? "—"}</td>
                    <td className="py-2.5 px-4 text-gray-600">{fmtFecha(m.fecha_emision)}</td>
                    <td className={`py-2.5 px-4 ${m.vencida ? "font-semibold text-red-600" : "text-gray-600"}`}>{fmtFecha(m.fecha_vencimiento)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{fmtGs(m.total)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700">{fmtGs(m.cobrado)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold">{fmtGs(m.saldo)}</td>
                    <td className="py-2.5 px-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[m.vencida && m.estado !== "pagado" ? "vencido" : m.estado] ?? ESTADO_BADGE.pendiente}`}>
                        {m.vencida && m.estado !== "pagado" ? "Vencido" : m.estado.charAt(0).toUpperCase() + m.estado.slice(1)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {m.estado === "pagado" || m.estado === "anulado" ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <button onClick={() => abrirCobro(m)} className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]">Registrar cobro</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de cobros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-700">Historial de cobros</h2></div>
        {cobros.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Sin cobros registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Fecha</th>
                  <th className="py-2.5 px-4 font-medium">Método</th>
                  <th className="py-2.5 px-4 font-medium">Referencia</th>
                  <th className="py-2.5 px-4 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cobros.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 text-gray-600">{fmtFecha(c.fecha_pago)}</td>
                    <td className="py-2.5 px-4 text-gray-700 capitalize">{c.metodo_pago}</td>
                    <td className="py-2.5 px-4 text-gray-500">{c.referencia ?? "—"}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-emerald-700">{fmtGs(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cobrando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Registrar cobro</h3>
              <p className="text-xs text-gray-500">{cobrando.numero_venta} · Saldo {fmtGs(cobrando.saldo)}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {errorCobro && <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-sm text-red-700">{errorCobro}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto a cobrar</label>
                <input type="number" min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <button type="button" onClick={() => setMonto(String(cobrando.saldo))} className="mt-1 text-xs text-[#4FAEB2] hover:underline">Cobrar saldo total</button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as (typeof METODOS)[number])} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white">
                  {METODOS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Referencia (opcional)</label>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setCobrando(null)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={registrarCobro} disabled={guardando} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4FAEB2] px-5 py-2 text-sm font-medium text-white hover:bg-[#3F8E91] disabled:opacity-50">
                {guardando ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : "Confirmar cobro"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
