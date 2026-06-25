"use client";

/**
 * Módulo "Consulta y envío a caja" — Ferretería Chaco.
 *
 * Flujo:
 *   1. Buscar producto (nombre / SKU).
 *   2. Ver stock, ubicación física y precio.
 *   3. Agregar al "carrito" del pedido (cantidad + tipo de precio).
 *   4. Opcional: elegir cliente.
 *   5. Elegir a qué Caja (1, 2 o 3) se manda.
 *   6. "Enviar a caja" → aparece en /ventas como pedido pendiente para el cajero de esa caja.
 *   7. Listado de "mis pedidos" abajo: pendiente / facturado / cancelado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getClientes } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import { Search, MapPin, Trash2, Send, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";

type ProductoHit = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  precio_mayorista: number;
  stock_actual: number;
  ubicacion_deposito?: string | null;
  ubicacion_pasillo?: string | null;
  ubicacion_estante?: string | null;
  ubicacion_caja?: string | null;
};

type CartItem = {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  stock_actual: number;
  cantidad: number;
  tipo_precio: "minorista" | "mayorista";
  precio_venta: number;
  precio_mayorista: number;
};

type MiPedido = {
  id: string;
  titulo: string;
  cliente_nombre: string | null;
  total_estimado: number;
  items_count: number;
  estado_facturacion: "pendiente_caja" | "facturado" | "cancelado";
  caja_destino_numero: number | null;
  venta_numero: string | null;
  created_at: string | null;
  facturado_at: string | null;
};

function fmtGs(v: number) {
  return `Gs. ${Math.round(v || 0).toLocaleString("es-PY")}`;
}

function ubicacionTexto(p: ProductoHit) {
  const parts: string[] = [];
  if (p.ubicacion_deposito) parts.push(p.ubicacion_deposito);
  if (p.ubicacion_pasillo) parts.push(`P:${p.ubicacion_pasillo}`);
  if (p.ubicacion_estante) parts.push(`E:${p.ubicacion_estante}`);
  if (p.ubicacion_caja) parts.push(`C:${p.ubicacion_caja}`);
  return parts.length ? parts.join(" · ") : null;
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit" }) +
      " " +
      d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

const NUMEROS_CAJA = [1, 2, 3] as const;

export default function ConsultaPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductoHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [cajaDestino, setCajaDestino] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [misPedidos, setMisPedidos] = useState<MiPedido[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Búsqueda con debounce
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setHits([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/productos/search?q=${encodeURIComponent(trimmed)}&limit=30`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancel) return;
        const baseHits: ProductoHit[] = (j?.data?.items ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nombre: String(p.nombre ?? ""),
          sku: String(p.sku ?? ""),
          precio_venta: Number(p.precio_venta) || 0,
          precio_mayorista: Number(p.precio_mayorista) || 0,
          stock_actual: Number(p.stock_actual) || 0,
        }));
        // Enriquecer con ubicación leyendo /api/productos (sí trae los 4 campos).
        if (baseHits.length > 0) {
          try {
            const rPro = await fetchWithSupabaseSession("/api/productos", { cache: "no-store" });
            const jPro = await rPro.json();
            const all: Record<string, Record<string, unknown>> = {};
            for (const p of (jPro?.data?.productos ?? [])) {
              all[String((p as { id: string }).id)] = p as Record<string, unknown>;
            }
            for (const h of baseHits) {
              const x = all[h.id];
              if (x) {
                h.ubicacion_deposito = (x.ubicacion_deposito as string | null) ?? null;
                h.ubicacion_pasillo = (x.ubicacion_pasillo as string | null) ?? null;
                h.ubicacion_estante = (x.ubicacion_estante as string | null) ?? null;
                h.ubicacion_caja = (x.ubicacion_caja as string | null) ?? null;
              }
            }
          } catch { /* opcional */ }
        }
        setHits(baseHits);
      } finally {
        if (!cancel) setBuscando(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  // Cargas iniciales
  useEffect(() => {
    getClientes().then(setClientes).catch(() => setClientes([]));
    void refreshMisPedidos();
    inputRef.current?.focus();
  }, []);

  const refreshMisPedidos = useCallback(async () => {
    try {
      const r = await fetchWithSupabaseSession("/api/pedidos-caja?estado=todos&mios=1", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) return;
      const raw = (j.data?.pedidos ?? []) as Array<Record<string, unknown>>;
      setMisPedidos(raw.map((p) => ({
        id: String(p.id),
        titulo: String(p.titulo ?? ""),
        cliente_nombre: p.cliente_nombre ? String(p.cliente_nombre) : null,
        total_estimado: Number(p.total_estimado) || 0,
        items_count: Array.isArray(p.items) ? (p.items as unknown[]).length : 0,
        estado_facturacion:
          p.estado === "facturado" ? "facturado" :
          p.estado === "cancelado" ? "cancelado" :
          "pendiente_caja",
        caja_destino_numero: p.caja_destino_numero == null ? null : Number(p.caja_destino_numero),
        venta_numero: p.venta_numero ? String(p.venta_numero) : null,
        created_at: p.created_at ? String(p.created_at) : null,
        facturado_at: p.facturado_at ? String(p.facturado_at) : null,
      })));
    } catch { /* opcional */ }
  }, []);

  function addToCart(p: ProductoHit) {
    setCart((prev) => {
      const ex = prev.find((x) => x.producto_id === p.id);
      if (ex) return prev.map((x) => x.producto_id === p.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, {
        producto_id: p.id,
        producto_nombre: p.nombre,
        sku: p.sku,
        stock_actual: p.stock_actual,
        cantidad: 1,
        tipo_precio: "minorista",
        precio_venta: p.precio_venta,
        precio_mayorista: p.precio_mayorista,
      }];
    });
    setOkMsg(null); setErrMsg(null);
  }

  function updateCart(id: string, patch: Partial<CartItem>) {
    setCart((prev) => prev.map((x) => x.producto_id === id ? { ...x, ...patch } : x));
  }
  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((x) => x.producto_id !== id));
  }

  const totalCart = useMemo(
    () => cart.reduce((s, it) => s + it.cantidad * (it.tipo_precio === "mayorista" ? it.precio_mayorista : it.precio_venta), 0),
    [cart]
  );

  async function cancelarPedido(p: MiPedido) {
    const ok = window.confirm(
      `¿Cancelar el pedido "${p.titulo}"?\n\n` +
      `Total: ${fmtGs(p.total_estimado)} · ${p.items_count} item(s)\n\n` +
      `El cajero ya no lo va a ver. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    try {
      const r = await fetchWithSupabaseSession(
        `/api/pedidos-caja/${p.id}?motivo=cancelado+por+vendedor`,
        { method: "DELETE" }
      );
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      void refreshMisPedidos();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo cancelar el pedido.");
    }
  }

  async function enviar() {
    if (cart.length === 0) { setErrMsg("El pedido está vacío."); return; }
    if (cajaDestino === null) { setErrMsg("Elegí a qué caja (1, 2 o 3) se manda el pedido."); return; }
    setEnviando(true); setErrMsg(null); setOkMsg(null);
    try {
      const cliente = clientes.find((c) => c.id === clienteId);
      const nombreCli = cliente ? (cliente.empresa || cliente.nombre_contacto || null) : null;
      const body = {
        cliente_id: clienteId || null,
        cliente_nombre: nombreCli,
        cliente_telefono: cliente?.telefono ?? null,
        caja_destino_numero: cajaDestino,
        items: cart.map((it) => ({
          producto_id: it.producto_id,
          producto_nombre: it.producto_nombre,
          sku: it.sku,
          cantidad: it.cantidad,
          precio_venta: it.tipo_precio === "mayorista" ? it.precio_mayorista : it.precio_venta,
          tipo_precio: it.tipo_precio,
        })),
      };
      const r = await fetchWithSupabaseSession("/api/pedidos-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setOkMsg(`Pedido "${j.data.pedido.titulo}" enviado a Caja ${cajaDestino}.`);
      setCart([]); setClienteId(""); setCajaDestino(null);
      void refreshMisPedidos();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "No se pudo enviar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ferretería Chaco · Salón"
        title="Consulta de productos"
        description="Buscá un producto, verificá stock y ubicación, y mandá el pedido a la caja elegida para cobrarlo."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Buscador + resultados */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Search className="h-5 w-5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              autoComplete="off"
            />
            {buscando && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>

          {q.trim().length < 2 ? (
            <p className="text-sm text-slate-400 px-1">Escribí al menos 2 caracteres para buscar.</p>
          ) : hits.length === 0 && !buscando ? (
            <p className="text-sm text-slate-400 px-1">Sin resultados para &quot;{q}&quot;.</p>
          ) : (
            <ul className="space-y-2">
              {hits.map((p) => {
                const ub = ubicacionTexto(p);
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-slate-900 truncate">{p.nombre}</h3>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <span className="font-mono">{p.sku}</span>
                        </div>
                        {ub && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            <span>{ub}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-medium ${p.stock_actual <= 0 ? "text-red-600" : p.stock_actual < 5 ? "text-amber-600" : "text-emerald-700"}`}>
                          {p.stock_actual <= 0 ? "Sin stock" : `${p.stock_actual} u`}
                        </div>
                        <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums">{fmtGs(p.precio_venta)}</div>
                        {p.precio_mayorista > 0 && p.precio_mayorista !== p.precio_venta && (
                          <div className="text-[11px] text-slate-500 tabular-nums">May: {fmtGs(p.precio_mayorista)}</div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => addToCart(p)}
                        className="shrink-0 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
                      >
                        Agregar al pedido
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Carrito */}
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm h-fit sticky top-4">
          <h2 className="text-sm font-semibold text-slate-900">Pedido a armar</h2>
          <p className="text-xs text-slate-500">Cuando termines, lo mandás a una caja para que se cobre.</p>

          {cart.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-400">No hay productos.<br/>Buscá uno y agregalo.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                {cart.map((it) => {
                  const precio = it.tipo_precio === "mayorista" ? it.precio_mayorista : it.precio_venta;
                  return (
                    <li key={it.producto_id} className="rounded-lg border border-slate-200 p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 truncate">{it.producto_nombre}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{it.sku}</p>
                        </div>
                        <button onClick={() => removeFromCart(it.producto_id)} className="text-slate-400 hover:text-red-500" aria-label="Quitar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-0.5">Cant.</label>
                          <input
                            type="number"
                            min={1}
                            value={it.cantidad}
                            onChange={(e) => updateCart(it.producto_id, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-center tabular-nums"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] uppercase text-slate-400 mb-0.5">Precio</label>
                          <select
                            value={it.tipo_precio}
                            onChange={(e) => updateCart(it.producto_id, { tipo_precio: e.target.value as "minorista" | "mayorista" })}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                          >
                            <option value="minorista">Minorista ({fmtGs(it.precio_venta)})</option>
                            {it.precio_mayorista > 0 && it.precio_mayorista !== it.precio_venta &&
                              <option value="mayorista">Mayorista ({fmtGs(it.precio_mayorista)})</option>}
                          </select>
                        </div>
                      </div>
                      <div className="mt-1.5 text-right text-[11px] font-semibold text-slate-700 tabular-nums">
                        Subtotal: {fmtGs(it.cantidad * precio)}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 border-t border-slate-200 pt-3 space-y-2">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Cliente (opcional)</label>
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    <option value="">— Sin cliente —</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.empresa || c.nombre_contacto || "Cliente"}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Mandar a la caja</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {NUMEROS_CAJA.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCajaDestino(n)}
                        className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                          cajaDestino === n
                            ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Caja {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm border-t border-slate-200 pt-2">
                  <span className="font-medium text-slate-700">Total:</span>
                  <span className="font-bold tabular-nums text-slate-900">{fmtGs(totalCart)}</span>
                </div>

                {errMsg && <p className="text-xs text-red-600">{errMsg}</p>}
                {okMsg && <p className="text-xs text-emerald-700">{okMsg}</p>}

                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando || cart.length === 0 || cajaDestino === null}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {cajaDestino === null ? "Elegí una caja primero" : `Enviar a Caja ${cajaDestino}`}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Mis pedidos */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Mis pedidos enviados</h2>
          <p className="text-xs text-slate-500">Últimos 50 — pendientes en caja y ya facturados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Pedido</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-left">Caja</th>
                <th className="px-4 py-2.5 text-right">Items</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Estado</th>
                <th className="px-4 py-2.5 text-left">Fecha</th>
                <th className="px-4 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {misPedidos.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">Todavía no enviaste ningún pedido.</td></tr>
              ) : misPedidos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.titulo}</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.cliente_nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">{p.caja_destino_numero ? `Caja ${p.caja_destino_numero}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{p.items_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtGs(p.total_estimado)}</td>
                  <td className="px-4 py-2.5">
                    {p.estado_facturacion === "facturado" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Cobrado{p.venta_numero ? ` · ${p.venta_numero}` : ""}
                      </span>
                    ) : p.estado_facturacion === "cancelado" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <XCircle className="h-3 w-3" />
                        Cancelado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Clock className="h-3 w-3" />
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtFecha(p.created_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {p.estado_facturacion === "pendiente_caja" ? (
                      <button
                        type="button"
                        onClick={() => cancelarPedido(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="h-3 w-3" />
                        Cancelar
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
