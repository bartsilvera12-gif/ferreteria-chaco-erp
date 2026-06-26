"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCompras } from "@/lib/compras/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import type { Compra, TipoPago } from "@/lib/compras/types";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white";

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
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

function formatFechaCorta(yyyymmdd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyymmdd);
  if (!m) return yyyymmdd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const tipoPagoBadge: Record<TipoPago, string> = {
  contado: "bg-blue-50 text-blue-700",
  credito: "bg-orange-50 text-orange-700",
};

// ── Agrupación por numero_control: 1 compra = N filas ─────────────────────────
type GrupoCompra = {
  numero_control: string;
  proveedor_nombre: string;
  fecha: string;
  tipo_pago: TipoPago;
  plazo_dias?: number;
  items: Compra[];
  total: number;
  comprobante: boolean;
};

interface CompraPago {
  id: string;
  numero_control: string;
  monto: number;
  fecha_pago: string;
  metodo: string | null;
  nota: string | null;
  created_at: string;
}

type PagosState = "loading" | { items: CompraPago[]; error?: string };

function agrupar(rows: Compra[]): GrupoCompra[] {
  const map = new Map<string, GrupoCompra>();
  for (const c of rows) {
    const key = c.numero_control || c.id;
    let g = map.get(key);
    if (!g) {
      g = {
        numero_control: c.numero_control,
        proveedor_nombre: c.proveedor_nombre,
        fecha: c.fecha,
        tipo_pago: c.tipo_pago,
        plazo_dias: c.plazo_dias,
        items: [],
        total: 0,
        comprobante: false,
      };
      map.set(key, g);
    }
    g.items.push(c);
    g.total += Number(c.total) || 0;
    if (c.comprobante_storage_path) g.comprobante = true;
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}

function resumenProductos(items: Compra[]): string {
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0].producto_nombre;
  return `${items[0].producto_nombre} + ${items.length - 1} más`;
}

export default function ComprasPage() {
  const [todas, setTodas] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoPago, setFiltroTipoPago] = useState<TipoPago | "">("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [pagosByCompra, setPagosByCompra] = useState<Record<string, PagosState>>({});

  useEffect(() => {
    let cancel = false;
    getCompras().then((data) => {
      if (cancel) return;
      setTodas(data);
    });
    return () => { cancel = true; };
  }, []);

  const grupos = useMemo(() => agrupar(todas), [todas]);

  const filtrados = useMemo(() => {
    const texto = busqueda.toLowerCase().trim();
    return grupos.filter((g) => {
      const coincideTexto =
        texto === "" ||
        g.proveedor_nombre.toLowerCase().includes(texto) ||
        g.numero_control.toLowerCase().includes(texto) ||
        g.items.some((i) => i.producto_nombre.toLowerCase().includes(texto));
      const coincideTipoPago = filtroTipoPago === "" || g.tipo_pago === filtroTipoPago;
      return coincideTexto && coincideTipoPago;
    });
  }, [grupos, busqueda, filtroTipoPago]);

  const hayFiltros = busqueda || filtroTipoPago;

  const fetchPagos = useCallback(async (numero: string) => {
    setPagosByCompra((prev) => ({ ...prev, [numero]: "loading" }));
    try {
      const r = await fetch(`/api/compras/pagos?numero_control=${encodeURIComponent(numero)}`, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json?.success) {
        setPagosByCompra((prev) => ({ ...prev, [numero]: { items: [], error: json?.error || "No se pudieron cargar los pagos." } }));
        return;
      }
      const items = (json.data ?? []).map((p: CompraPago) => ({ ...p, monto: Number(p.monto) }));
      setPagosByCompra((prev) => ({ ...prev, [numero]: { items } }));
    } catch {
      setPagosByCompra((prev) => ({ ...prev, [numero]: { items: [], error: "No se pudieron cargar los pagos." } }));
    }
  }, []);

  function toggle(g: GrupoCompra) {
    const numero = g.numero_control;
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(numero)) {
        next.delete(numero);
      } else {
        next.add(numero);
        if (g.tipo_pago === "credito" && !(numero in pagosByCompra)) {
          void fetchPagos(numero);
        }
      }
      return next;
    });
  }

  return (
    <div className="space-y-8">

      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
            style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Adquisiciones</p>
        </div>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Compras</h1>
        <p className="mt-0.5 text-xs text-slate-500">Registro de órdenes de compra a proveedores</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-5 lg:p-6">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Órdenes de compra</h2>
          <div className="flex items-center gap-3">
            <ExportExcelButton url="/api/compras/export" />
            <Link href="/compras/nueva"
              className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95">
              + Nueva compra
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input type="text" placeholder="Buscar por proveedor, producto o N° control..."
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-0 flex-1 sm:min-w-72`} />
          <FancySelect value={filtroTipoPago} onChange={(v) => setFiltroTipoPago(v as TipoPago | "")}
            ariaLabel="Filtrar por tipo de pago" className="w-44" size="sm"
            options={[
              { value: "", label: "Todos los pagos" },
              { value: "contado", label: "Contado" },
              { value: "credito", label: "Crédito" },
            ]} />
          {hayFiltros && (
            <button onClick={() => { setBusqueda(""); setFiltroTipoPago(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2">
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtrados.length} de {grupos.length} compras
          </span>
        </div>

        {/* Tabla agrupada por compra */}
        <EdgeScrollArea>
          <table className="w-full min-w-[760px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3 pr-4 font-medium">N° Control</th>
                <th className="py-3 pr-4 font-medium">Proveedor</th>
                <th className="py-3 pr-4 font-medium">Productos</th>
                <th className="py-3 pr-4 font-medium text-right">Ítems</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="hidden py-3 pr-4 font-medium lg:table-cell">Pago</th>
                <th className="py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    {grupos.length === 0 ? "No hay compras registradas" : "Ninguna compra coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtrados.map((g) => {
                  const abierto = expandidos.has(g.numero_control);
                  const multi = g.items.length > 1;
                  const esCredito = g.tipo_pago === "credito";
                  const clickable = multi || esCredito;
                  return (
                    <FragmentRow key={g.numero_control}>
                      <tr
                        className={`border-b border-slate-200 transition-colors hover:bg-[#4FAEB2]/[0.04] ${clickable ? "cursor-pointer" : ""}`}
                        onClick={() => clickable && toggle(g)}
                      >
                        <td className="py-4 pr-4 font-mono text-xs text-gray-500">
                          {clickable && <span className="mr-1 inline-block text-gray-400">{abierto ? "▾" : "▸"}</span>}
                          {g.numero_control}
                        </td>
                        <td className="py-4 pr-4 font-medium text-gray-800">{g.proveedor_nombre}</td>
                        <td className="py-4 pr-4 text-gray-600">
                          <div>{resumenProductos(g.items)}</div>
                          {g.comprobante && (
                            <a
                              href={`/api/compras/comprobante?numero_control=${encodeURIComponent(g.numero_control)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                            >
                              📎 Ver comprobante
                            </a>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-right tabular-nums text-gray-700">{g.items.length}</td>
                        <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800">{formatGs(g.total)}</td>
                        <td className="hidden py-4 pr-4 lg:table-cell">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${g.tipo_pago ? tipoPagoBadge[g.tipo_pago] : "bg-gray-100 text-gray-500"}`}>
                            {g.tipo_pago === "contado" ? "Contado" : g.tipo_pago === "credito" ? `Crédito ${g.plazo_dias ?? ""}d` : "—"}
                          </span>
                        </td>
                        <td className="py-4 text-gray-500 text-xs tabular-nums">{formatFecha(g.fecha)}</td>
                      </tr>

                      {abierto && multi && g.items.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100 bg-slate-50/50 text-xs">
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4 text-gray-700">
                            <span className="font-medium">{it.producto_nombre}</span>
                            <span className="ml-2 font-mono text-gray-400">{formatGs(it.costo_unitario)}/u</span>
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{it.cantidad}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{formatGs(it.total)}</td>
                          <td className="hidden lg:table-cell" />
                          <td />
                        </tr>
                      ))}

                      {abierto && esCredito && (
                        <tr className="border-b border-slate-200 bg-orange-50/40">
                          <td colSpan={7} className="px-3 py-3">
                            <PagosPanel
                              grupo={g}
                              state={pagosByCompra[g.numero_control]}
                              onRegistrado={() => fetchPagos(g.numero_control)}
                              onReintentar={() => fetchPagos(g.numero_control)}
                            />
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })
              )}
            </tbody>
          </table>
        </EdgeScrollArea>

      </div>

      <MobileFab href="/compras/nueva" label="Nueva compra" />
    </div>
  );
}

/** Wrapper para agrupar fila principal + filas de detalle sin <div> en <tbody>. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Panel de cuotas/pagos para compras a crédito ───────────────────────────────
function PagosPanel({
  grupo,
  state,
  onRegistrado,
  onReintentar,
}: {
  grupo: GrupoCompra;
  state: PagosState | undefined;
  onRegistrado: () => void;
  onReintentar: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [monto, setMonto] = useState("");
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  if (state === undefined || state === "loading") {
    return <p className="text-xs text-gray-500">Cargando cuotas…</p>;
  }

  const pagos = state.items;
  const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldo = Math.max(grupo.total - pagado, 0);
  const cancelada = saldo <= 0.5;

  async function registrar() {
    setErrorForm(null);
    const m = Number(monto.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(m) || m <= 0) {
      setErrorForm("Ingresá un monto válido.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/compras/pagos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          numero_control: grupo.numero_control,
          monto: m,
          fecha_pago: fechaPago || undefined,
          metodo: metodo.trim() || undefined,
          nota: nota.trim() || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json?.success) {
        setErrorForm(json?.error || "No se pudo registrar el pago.");
        setEnviando(false);
        return;
      }
      setMonto("");
      setMetodo("");
      setNota("");
      setMostrarForm(false);
      setEnviando(false);
      onRegistrado();
    } catch {
      setErrorForm("Error de red al registrar el pago.");
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold uppercase tracking-wide text-orange-700">Cuotas pagadas</span>
        {cancelada && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Cancelada
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMostrarForm((v) => !v); }}
          disabled={cancelada}
          className="ml-auto rounded-md border border-orange-300 bg-white px-3 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50 disabled:hover:bg-white"
        >
          {mostrarForm ? "Cancelar" : "+ Registrar pago"}
        </button>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <span>{state.error}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onReintentar(); }} className="underline">
            Reintentar
          </button>
        </div>
      )}

      {pagos.length === 0 ? (
        <p className="text-xs text-gray-500">Todavía no hay pagos registrados para esta compra.</p>
      ) : (
        <ul className="divide-y divide-orange-100 rounded-md border border-orange-100 bg-white">
          {pagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
              <span className="font-mono text-gray-500">{formatFechaCorta(p.fecha_pago)}</span>
              <span className="font-semibold tabular-nums text-gray-800">{formatGs(Number(p.monto))}</span>
              {p.metodo && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">{p.metodo}</span>}
              {p.nota && <span className="text-gray-500">— {p.nota}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Resumen estilo recibo */}
      <div className="ml-auto w-full max-w-xs rounded-lg border-2 border-dashed border-orange-300 bg-white p-3 shadow-sm">
        <div className="mb-1.5 border-b border-dashed border-orange-200 pb-1 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
          Resumen de pago
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Total compra</dt>
            <dd className="font-semibold tabular-nums text-gray-800">{formatGs(grupo.total)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Pagado</dt>
            <dd className="font-semibold tabular-nums text-emerald-700">− {formatGs(pagado)}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between border-t-2 border-double border-orange-300 pt-1.5">
            <dt className={`text-[11px] font-bold uppercase tracking-wider ${cancelada ? "text-emerald-700" : "text-orange-700"}`}>Saldo</dt>
            <dd className={`text-base font-bold tabular-nums ${cancelada ? "text-emerald-700" : "text-orange-700"}`}>{formatGs(saldo)}</dd>
          </div>
        </dl>
      </div>

      {mostrarForm && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="grid gap-2 rounded-md border border-orange-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Monto
            <input
              type="text"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={`Hasta ${formatGs(saldo)}`}
              className={inputFilterClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Fecha
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className={inputFilterClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Método
            <input
              type="text"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              placeholder="Efectivo, transferencia…"
              className={inputFilterClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Nota (opcional)
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className={inputFilterClass}
            />
          </label>
          {errorForm && <div className="sm:col-span-2 lg:col-span-4 text-xs text-red-600">{errorForm}</div>}
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              type="button"
              onClick={registrar}
              disabled={enviando}
              className="rounded-md bg-[#4FAEB2] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-60"
            >
              {enviando ? "Guardando…" : "Guardar pago"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
