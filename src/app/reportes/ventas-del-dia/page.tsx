"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, XCircle } from "lucide-react";
import { getVentas } from "@/lib/ventas/storage";
import { getCajaAbierta, getResumenCaja } from "@/lib/caja/storage";
import type { Caja, CajaResumen } from "@/lib/caja/types";
import type { TipoVenta, TipoIvaVenta, Venta } from "@/lib/ventas/types";

const TZ = "America/Asuncion";
/** YYYY-MM-DD del "hoy" en Asunción. */
function hoyAsuncionYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
/** YYYY-MM-DD (Asunción) de un ISO cualquiera. */
function asuncionYmd(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

const tipoVentaBadge: Record<TipoVenta, string> = {
  CONTADO: "bg-blue-50 text-blue-700",
  CREDITO: "bg-orange-50 text-orange-700",
};

const ivaLabel: Record<TipoIvaVenta, string> = {
  EXENTA: "Exenta",
  "5%": "IVA 5%",
  "10%": "IVA 10%",
};

function ivaResumen(v: Venta): string {
  const tipos = [...new Set(v.items.map((i) => i.tipo_iva))];
  if (tipos.length === 1) return ivaLabel[tipos[0]];
  return "Mixto";
}

function ResumenTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-emerald-300 bg-emerald-100/60" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-1 shadow-sm ${
      accent ? "bg-[#4FAEB2] border-[#4FAEB2]" : "bg-white border-[#4FAEB2]/30"
    }`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${accent ? "text-white/90" : "text-[#4FAEB2]"}`}>{label}</span>
      <span className={`text-2xl font-bold tabular-nums leading-tight ${accent ? "text-white" : "text-[#3F8E91]"}`}>{value}</span>
      {sub && <span className={`text-xs ${accent ? "text-white/80" : "text-slate-500"}`}>{sub}</span>}
    </div>
  );
}

function fmtFechaLarga(ymd: string): string {
  try {
    const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return ymd;
  }
}

export default function VentasDelDiaPage() {
  const [todas, setTodas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dia, setDia] = useState<string>(() => hoyAsuncionYmd());
  const esHoy = dia === hoyAsuncionYmd();

  const [anularTarget, setAnularTarget] = useState<Venta | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anularLoading, setAnularLoading] = useState(false);
  const [anularError, setAnularError] = useState<string | null>(null);

  const [caja, setCaja] = useState<Caja | null>(null);
  const [resumenCaja, setResumenCaja] = useState<CajaResumen | null>(null);

  const cargarResumenCaja = useCallback(async () => {
    const c = await getCajaAbierta();
    setCaja(c);
    setResumenCaja(c ? await getResumenCaja(c.id) : null);
  }, []);

  useEffect(() => {
    setCargando(true);
    getVentas()
      .then(setTodas)
      .finally(() => setCargando(false));
    void cargarResumenCaja();
  }, [refreshKey, cargarResumenCaja]);

  const ventasDia = useMemo(() => todas.filter((v) => {
    try { return asuncionYmd(v.fecha) === dia; } catch { return false; }
  }), [todas, dia]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ventasDia;
    return ventasDia.filter((v) => {
      const numero = v.numero_control.toLowerCase();
      const productos = v.items.map((i) => `${i.producto_nombre} ${i.sku}`.toLowerCase()).join(" ");
      return numero.includes(q) || productos.includes(q);
    });
  }, [ventasDia, busqueda]);

  const totales = useMemo(() => {
    const activas = filtradas.filter((v) => v.estado !== "anulada");
    const facturacion = activas.reduce((s, v) => s + v.total, 0);
    const cantidad = activas.length;
    const unidades = activas.reduce((s, v) => s + v.items.reduce((si, i) => si + i.cantidad, 0), 0);
    const promedio = cantidad > 0 ? facturacion / cantidad : 0;
    return { facturacion, cantidad, unidades, promedio };
  }, [filtradas]);

  async function confirmarAnulacion() {
    if (!anularTarget) return;
    const motivo = anularMotivo.trim();
    if (motivo.length < 3) { setAnularError("El motivo es obligatorio (mínimo 3 caracteres)."); return; }
    setAnularLoading(true); setAnularError(null);
    try {
      const r = await fetch(`/api/ventas/${anularTarget.id}/anular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setAnularTarget(null); setAnularMotivo("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setAnularError(e instanceof Error ? e.message : "No se pudo anular la venta.");
    } finally {
      setAnularLoading(false);
    }
  }

  function imprimirTicket(v: Venta) {
    try { window.open(`/api/ventas/${v.id}/ticket`, "_blank", "noopener"); } catch {}
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Ferretería Chaco · Reportes
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Ventas del día</h1>
          <p className="mt-1 text-sm text-slate-500 first-letter:uppercase">{fmtFechaLarga(dia)}{esHoy ? " · hoy" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            Filtrar por día:
            <input
              type="date"
              value={dia}
              max={hoyAsuncionYmd()}
              onChange={(e) => setDia(e.target.value || hoyAsuncionYmd())}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </label>
          {!esHoy && (
            <button
              type="button"
              onClick={() => setDia(hoyAsuncionYmd())}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Hoy
            </button>
          )}
          <Link href="/ventas" className="text-sm text-indigo-600 hover:underline">← Volver a Caja</Link>
        </div>
      </div>

      {/* Estado de caja actual */}
      {caja && resumenCaja && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Caja abierta</p>
              <p className="mt-0.5 text-xs text-slate-500">Apertura {formatFecha(caja.fecha_apertura)} · Monto inicial {formatGs(caja.monto_apertura)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResumenTile label="Total vendido" value={formatGs(resumenCaja.total_vendido)} sub={`${resumenCaja.cantidad_ventas} venta(s)`} />
            <ResumenTile label="Efectivo" value={formatGs(resumenCaja.total_efectivo)} />
            <ResumenTile label="Transferencia" value={formatGs(resumenCaja.total_transferencia)} />
            <ResumenTile label="Tarjeta" value={formatGs(resumenCaja.total_tarjeta)} />
            <ResumenTile label="Debería haber en caja" value={formatGs(resumenCaja.efectivo_esperado)} sub="apertura + efectivo ± mov." accent />
            <ResumenTile label="Ingresos efvo." value={formatGs(resumenCaja.ingresos_efectivo)} />
            <ResumenTile label="Egresos efvo." value={formatGs(resumenCaja.egresos_efectivo)} />
            <ResumenTile label="Retiros efvo." value={formatGs(resumenCaja.retiros_efectivo)} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={esHoy ? "Facturación de hoy" : "Facturación del día"} value={formatGs(totales.facturacion)} sub="Total incl. IVA" accent />
        <MetricCard label={esHoy ? "Ventas de hoy" : "Ventas del día"} value={String(totales.cantidad)} sub={totales.cantidad === 1 ? "orden registrada" : "órdenes registradas"} />
        <MetricCard label="Ticket promedio" value={totales.promedio > 0 ? formatGs(totales.promedio) : "—"} sub="Por orden de venta" />
        <MetricCard label="Unidades vendidas" value={String(totales.unidades)} sub="Unidades despachadas" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="search"
          placeholder="Buscar por número o producto…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-3">Número</th>
              <th className="px-3 py-3">Productos</th>
              <th className="px-3 py-3 text-right">Ítems</th>
              <th className="px-3 py-3 text-right">Cant. total</th>
              <th className="px-3 py-3">IVA</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Pago</th>
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-400">Cargando ventas…</td>
              </tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  {ventasDia.length === 0
                    ? (esHoy ? "No hay ventas registradas hoy." : "No hay ventas registradas para el día seleccionado.")
                    : "Sin resultados."}
                </td>
              </tr>
            ) : (
              filtradas.map((v) => {
                const cantTotal = v.items.reduce((s, i) => s + i.cantidad, 0);
                const primer = v.items[0];
                const anulada = v.estado === "anulada";
                return (
                  <tr key={v.id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${anulada ? "bg-rose-50/40 text-slate-400" : ""}`}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {v.numero_control}
                      {anulada && (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                          Anulada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {primer ? (
                        <div>
                          <p className="truncate font-medium text-slate-800">{primer.producto_nombre}</p>
                          <p className="font-mono text-[11px] text-slate-500">{primer.sku}</p>
                        </div>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700 tabular-nums">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium">{v.items.length}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{cantTotal}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{ivaResumen(v)}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{formatGs(v.total)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tipoVentaBadge[v.tipo_venta]}`}>{v.tipo_venta === "CONTADO" ? "Contado" : "Crédito"}</span>
                    </td>
                    <td className="px-3 py-3 text-xs capitalize text-slate-600">{v.metodo_pago ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatFecha(v.fecha)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => imprimirTicket(v)}
                          title="Reimprimir ticket"
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                        >
                          <Printer className="h-3.5 w-3.5" /> Imprimir
                        </button>
                        {!anulada && (
                          <button
                            type="button"
                            onClick={() => { setAnularTarget(v); setAnularMotivo(""); setAnularError(null); }}
                            title="Anular venta"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal anular */}
      {anularTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!anularLoading) { setAnularTarget(null); setAnularMotivo(""); setAnularError(null); } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Anular venta</h3>
              <p className="mt-1 text-sm text-slate-500">
                Venta <strong className="text-slate-800">{anularTarget.numero_control}</strong> por {formatGs(anularTarget.total)}.
              </p>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Motivo *</span>
              <textarea
                rows={3}
                value={anularMotivo}
                onChange={(e) => setAnularMotivo(e.target.value)}
                placeholder="Ej. error de carga, cliente desistió, duplicado…"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30"
                autoFocus
              />
            </label>
            {anularError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{anularError}</div>
            )}
            <p className="text-xs text-slate-500">Esta acción revierte el stock, marca la venta como anulada y no se puede deshacer.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setAnularTarget(null); setAnularMotivo(""); setAnularError(null); }}
                disabled={anularLoading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void confirmarAnulacion()}
                disabled={anularLoading || anularMotivo.trim().length < 3}
                className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {anularLoading ? "Anulando…" : "Sí, anular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
