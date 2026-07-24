"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Package, Search, Trash2 } from "lucide-react";
import CajaControlPanel from "@/components/caja/CajaControlPanel";
import MontoInput, { parseMontoInput } from "@/components/ui/MontoInput";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { saveVenta } from "@/lib/ventas/storage";
import type { LineaVenta, MetodoPago } from "@/lib/ventas/types";
import { CARD_SURCHARGE_PCT, calcularRecargoTarjeta } from "@/lib/ventas/recargo-tarjeta";

type EntidadBancaria = { id: string; codigo: string | null; nombre: string; tipo: string | null };

// ── Tipos POS ───────────────────────────────────────────────────────────────

type ProductoHit = {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  precio_venta: number;
  precio_mayorista: number;
  cantidad_minima_mayorista: number | null;
  stock_actual: number;
  imagen_url: string | null;
  es_pintura: boolean;
  precio_efectivo: number | null;
  precio_tarjeta: number | null;
};

type CartItem = {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  imagen_url: string | null;
  stock_actual: number;
  cantidad: number;
  precio_venta: number;         // precio unitario minorista base
  precio_mayorista: number;     // precio unitario mayorista (0 si no aplica)
  cantidad_minima_mayorista: number | null;
  es_pintura: boolean;
  precio_efectivo: number | null;
  precio_tarjeta: number | null;
};

/** Precio unitario efectivo (contado) según la cantidad y el umbral del producto.
 *  Pintura con precio_efectivo cargado: usa ese como base contado.
 */
function precioEfectivo(it: Pick<CartItem, "cantidad" | "precio_venta" | "precio_mayorista" | "cantidad_minima_mayorista" | "es_pintura" | "precio_efectivo">): number {
  if (it.es_pintura && it.precio_efectivo != null && it.precio_efectivo > 0) {
    return it.precio_efectivo;
  }
  if (
    it.precio_mayorista > 0 &&
    it.cantidad_minima_mayorista != null &&
    it.cantidad_minima_mayorista > 0 &&
    it.cantidad >= it.cantidad_minima_mayorista
  ) {
    return it.precio_mayorista;
  }
  return it.precio_venta;
}
/** Precio unitario cuando el cobro es con tarjeta. Pintura con precio_tarjeta cargado
 *  usa ese valor; el resto sigue la lógica de recargo (se aplica arriba en confirmarCobro).
 */
function precioTarjeta(it: Pick<CartItem, "cantidad" | "precio_venta" | "precio_mayorista" | "cantidad_minima_mayorista" | "es_pintura" | "precio_efectivo" | "precio_tarjeta">): number {
  if (it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0) {
    return it.precio_tarjeta;
  }
  return precioEfectivo(it);
}
function esMayoristaAplicado(it: Pick<CartItem, "cantidad" | "precio_venta" | "precio_mayorista" | "cantidad_minima_mayorista" | "es_pintura" | "precio_efectivo">): boolean {
  return precioEfectivo(it) === it.precio_mayorista && it.precio_mayorista > 0 && it.precio_mayorista !== it.precio_venta;
}

function formatGs(v: number) {
  return `Gs. ${Math.round(v || 0).toLocaleString("es-PY")}`;
}

// ── Página principal ───────────────────────────────────────────────────────

export default function CajaPage() {
  // Estado de caja abierta
  const [cajaAbierta, setCajaAbierta] = useState(false);
  // Contador que la caja usa para refrescar su resumen tras cobrar.
  const [cajaRefreshTick, setCajaRefreshTick] = useState(0);

  // Búsqueda de productos (izquierda)
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductoHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchCacheRef = useRef<Map<string, { hits: ProductoHit[]; ts: number }>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  // Carrito + producto destacado (derecha)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ultimoAgregado, setUltimoAgregado] = useState<CartItem | null>(null);

  // Selector de cliente (opcional — null = consumidor final)
  type ClienteLite = { id: string; nombre: string; ruc: string | null; documento: string | null };
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientesAbierto, setClientesAbierto] = useState(false);

  // Modal "crear cliente" desde el POS
  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteRuc, setNuevoClienteRuc] = useState("");
  const [nuevoClienteDoc, setNuevoClienteDoc] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [nuevoClienteError, setNuevoClienteError] = useState<string | null>(null);
  const [nuevoClienteGuardando, setNuevoClienteGuardando] = useState(false);

  // Modal cobro
  const [cobroOpen, setCobroOpen] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [efectivoRecibido, setEfectivoRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  const [titular, setTitular] = useState("");
  const [entidadId, setEntidadId] = useState("");
  const [fechaAcreditacion, setFechaAcreditacion] = useState("");
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [cobroError, setCobroError] = useState<string | null>(null);
  const [ventaOk, setVentaOk] = useState<string | null>(null);

  // Modal "asociar código de barras a un producto"
  const [asociarOpen, setAsociarOpen] = useState(false);
  const [asociarCode, setAsociarCode] = useState("");
  const [asociarQuery, setAsociarQuery] = useState("");
  const [asociarHits, setAsociarHits] = useState<ProductoHit[]>([]);
  const [asociarBuscando, setAsociarBuscando] = useState(false);
  const [asociarGuardando, setAsociarGuardando] = useState(false);
  const [asociarError, setAsociarError] = useState<string | null>(null);

  // Búsqueda dentro del modal de asociar
  useEffect(() => {
    if (!asociarOpen) return;
    const trimmed = asociarQuery.trim();
    if (trimmed.length < 2) { setAsociarHits([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      setAsociarBuscando(true);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/productos/search?q=${encodeURIComponent(trimmed)}&limit=15`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancel) return;
        const items: ProductoHit[] = (j?.data?.items ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nombre: String(p.nombre ?? ""),
          sku: String(p.sku ?? ""),
          codigo_barras: (p.codigo_barras as string | null) ?? null,
          precio_venta: Number(p.precio_venta) || 0,
          precio_mayorista: Number(p.precio_mayorista) || 0,
          cantidad_minima_mayorista: p.cantidad_minima_mayorista != null ? Number(p.cantidad_minima_mayorista) : null,
          stock_actual: Number(p.stock_actual) || 0,
          imagen_url: (p.imagen_url as string | null) ?? null,
          es_pintura: p.es_pintura === true,
          precio_efectivo: p.precio_efectivo != null ? Number(p.precio_efectivo) : null,
          precio_tarjeta: p.precio_tarjeta != null ? Number(p.precio_tarjeta) : null,
        }));
        setAsociarHits(items);
      } finally {
        if (!cancel) setAsociarBuscando(false);
      }
    }, 220);
    return () => { cancel = true; clearTimeout(t); };
  }, [asociarQuery, asociarOpen]);

  function abrirAsociarCodigo(code: string) {
    setAsociarCode(code);
    setAsociarQuery("");
    setAsociarHits([]);
    setAsociarError(null);
    setAsociarOpen(true);
  }

  async function asociarYAgregar(prod: ProductoHit) {
    setAsociarGuardando(true);
    setAsociarError(null);
    try {
      const res = await fetch(`/api/productos/${prod.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo_barras: asociarCode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "No se pudo guardar el código.");
      addToCart({ ...prod, codigo_barras: asociarCode });
      setAsociarOpen(false);
    } catch (e) {
      setAsociarError(e instanceof Error ? e.message : "No se pudo guardar el código.");
    } finally {
      setAsociarGuardando(false);
    }
  }

  // Cargar entidades bancarias (para transferencia/tarjeta)
  useEffect(() => {
    let cancel = false;
    fetch("/api/entidades-bancarias", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel && j?.success) setEntidades(j.data?.entidades ?? []); })
      .catch(() => { /* opcional */ });
    return () => { cancel = true; };
  }, []);

  // Cargar lista de clientes para el selector.
  useEffect(() => {
    let cancel = false;
    fetchWithSupabaseSession("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        const rows = Array.isArray(j.data) ? j.data : [];
        const list: ClienteLite[] = rows.map((r: Record<string, unknown>) => {
          const empresa = typeof r.empresa === "string" ? r.empresa.trim() : "";
          const contacto = typeof r.nombre_contacto === "string" ? r.nombre_contacto.trim() : "";
          const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
          return {
            id: String(r.id),
            nombre: empresa || contacto || nombre || "(sin nombre)",
            ruc: (r.ruc as string | null) ?? null,
            documento: (r.documento as string | null) ?? null,
          };
        });
        setClientes(list);
      })
      .catch(() => { /* opcional */ });
    return () => { cancel = true; };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 20);
    return clientes
      .filter((c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.ruc ?? "").toLowerCase().includes(q) ||
        (c.documento ?? "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [clientes, clienteQuery]);

  function abrirCrearCliente() {
    setNuevoClienteNombre(clienteQuery.trim());
    setNuevoClienteRuc("");
    setNuevoClienteDoc("");
    setNuevoClienteTelefono("");
    setNuevoClienteError(null);
    setNuevoClienteOpen(true);
    setClientesAbierto(false);
  }

  async function crearClienteSubmit() {
    const nombre = nuevoClienteNombre.trim();
    if (!nombre) {
      setNuevoClienteError("El nombre es obligatorio.");
      return;
    }
    setNuevoClienteError(null);
    setNuevoClienteGuardando(true);
    try {
      const res = await fetchWithSupabaseSession("/api/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo_cliente: "empresa",
          empresa: nombre,
          nombre_contacto: nombre,
          ruc: nuevoClienteRuc.trim() || null,
          documento: nuevoClienteDoc.trim() || null,
          telefono: nuevoClienteTelefono.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) {
        setNuevoClienteError(j?.error ?? "No se pudo crear el cliente.");
        return;
      }
      const c = j.data as Record<string, unknown>;
      const nuevo: ClienteLite = {
        id: String(c.id),
        nombre:
          (typeof c.empresa === "string" && c.empresa.trim()) ||
          (typeof c.nombre_contacto === "string" && c.nombre_contacto.trim()) ||
          nombre,
        ruc: (c.ruc as string | null) ?? null,
        documento: (c.documento as string | null) ?? null,
      };
      setClientes((prev) => [nuevo, ...prev]);
      setClienteSel(nuevo);
      setClienteQuery("");
      setNuevoClienteOpen(false);
    } catch (e) {
      setNuevoClienteError(e instanceof Error ? e.message : "No se pudo crear el cliente.");
    } finally {
      setNuevoClienteGuardando(false);
    }
  }

  // Entidades disponibles según método (excluye tipo "caja" para trans/tarjeta).
  const entidadesFiltradas = useMemo(() => {
    if (metodo === "efectivo") return [];
    if (metodo === "tarjeta") return entidades.filter((e) => e.tipo === "tarjeta" || e.tipo === "banco");
    return entidades.filter((e) => e.tipo !== "caja"); // transferencia
  }, [entidades, metodo]);

  // Typeahead para el buscador de entidad (por código o nombre).
  const [entidadQuery, setEntidadQuery] = useState("");
  const entidadesTypeahead = useMemo(() => {
    const q = entidadQuery.trim().toLowerCase();
    if (!q) return entidadesFiltradas.slice(0, 8);
    return entidadesFiltradas
      .filter((e) =>
        (e.codigo ?? "").toLowerCase().includes(q) ||
        (e.nombre ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [entidadesFiltradas, entidadQuery]);
  const entidadSeleccionada = useMemo(
    () => entidadesFiltradas.find((e) => e.id === entidadId) ?? null,
    [entidadesFiltradas, entidadId]
  );

  // Búsqueda con debounce + cache en memoria + AbortController.
  // - Cache: las mismas letras dos veces (typo+backspace, buscar producto que
  //   ya viste, etc.) devuelven resultado sin fetch. TTL 50 min (menor al ~1h
  //   de vida de las signed URLs de imagen, así nunca mostramos link roto).
  // - Abort: cuando el usuario tipea la próxima letra, se cancela el fetch
  //   viejo — reduce carga en el server y evita que una respuesta lenta pise
  //   a una nueva más rápida.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setHits([]); return; }
    const key = trimmed.toLowerCase();

    // Cache hit → mostrar sin fetch.
    const cached = searchCacheRef.current.get(key);
    if (cached && Date.now() - cached.ts < 50 * 60 * 1000) {
      setHits(cached.hits);
      setBuscando(false);
      return;
    }

    let cancel = false;
    const t = setTimeout(async () => {
      // Cancelar cualquier fetch anterior aún en vuelo.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setBuscando(true);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/productos/search?q=${encodeURIComponent(trimmed)}&limit=15`,
          { cache: "no-store", signal: controller.signal }
        );
        const j = await res.json();
        if (cancel || controller.signal.aborted) return;
        const items: ProductoHit[] = (j?.data?.items ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nombre: String(p.nombre ?? ""),
          sku: String(p.sku ?? ""),
          codigo_barras: (p.codigo_barras as string | null) ?? null,
          precio_venta: Number(p.precio_venta) || 0,
          precio_mayorista: Number(p.precio_mayorista) || 0,
          cantidad_minima_mayorista: p.cantidad_minima_mayorista != null ? Number(p.cantidad_minima_mayorista) : null,
          stock_actual: Number(p.stock_actual) || 0,
          imagen_url: (p.imagen_url as string | null) ?? null,
          es_pintura: p.es_pintura === true,
          precio_efectivo: p.precio_efectivo != null ? Number(p.precio_efectivo) : null,
          precio_tarjeta: p.precio_tarjeta != null ? Number(p.precio_tarjeta) : null,
        }));
        searchCacheRef.current.set(key, { hits: items, ts: Date.now() });
        // Techo defensivo: si el cache pasa las 200 entradas, tiramos las viejas.
        if (searchCacheRef.current.size > 200) {
          const oldest = Array.from(searchCacheRef.current.entries())
            .sort((a, b) => a[1].ts - b[1].ts)
            .slice(0, 50)
            .map(([k]) => k);
          for (const k of oldest) searchCacheRef.current.delete(k);
        }
        setHits(items);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        throw e;
      } finally {
        if (!cancel && !controller.signal.aborted) setBuscando(false);
      }
    }, 180);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  const addToCart = useCallback((p: ProductoHit) => {
    const item: CartItem = {
      producto_id: p.id,
      producto_nombre: p.nombre,
      sku: p.sku,
      imagen_url: p.imagen_url,
      stock_actual: p.stock_actual,
      cantidad: 1,
      precio_venta: p.precio_venta,
      precio_mayorista: p.precio_mayorista,
      cantidad_minima_mayorista: p.cantidad_minima_mayorista,
      es_pintura: p.es_pintura,
      precio_efectivo: p.precio_efectivo,
      precio_tarjeta: p.precio_tarjeta,
    };
    setCart((prev) => {
      const ex = prev.find((x) => x.producto_id === p.id);
      if (ex) return prev.map((x) => x.producto_id === p.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, item];
    });
    setUltimoAgregado(item);
    setQ("");
    setHits([]);
    inputRef.current?.focus();
  }, []);

  // Scanner: si el usuario tipea/pega algo y termina con Enter, intento match exacto
  // por código de barras contra los hits actuales; si no hay hits todavía, hago una
  // búsqueda directa y agrego el primero.
  const onKeyDownBuscar = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    // Preferí match exacto de barcode entre los hits actuales.
    const exact = hits.find((h) => h.codigo_barras === term || h.sku.toLowerCase() === term.toLowerCase());
    if (exact) { addToCart(exact); return; }
    // Sin hits todavía → búsqueda directa
    try {
      const res = await fetchWithSupabaseSession(
        `/api/productos/search?q=${encodeURIComponent(term)}&limit=1`,
        { cache: "no-store" }
      );
      const j = await res.json();
      const first = (j?.data?.items ?? [])[0] as Record<string, unknown> | undefined;
      if (first) {
        addToCart({
          id: String(first.id),
          nombre: String(first.nombre ?? ""),
          sku: String(first.sku ?? ""),
          codigo_barras: (first.codigo_barras as string | null) ?? null,
          precio_venta: Number(first.precio_venta) || 0,
          precio_mayorista: Number(first.precio_mayorista) || 0,
          cantidad_minima_mayorista: first.cantidad_minima_mayorista != null ? Number(first.cantidad_minima_mayorista) : null,
          stock_actual: Number(first.stock_actual) || 0,
          imagen_url: (first.imagen_url as string | null) ?? null,
          es_pintura: first.es_pintura === true,
          precio_efectivo: first.precio_efectivo != null ? Number(first.precio_efectivo) : null,
          precio_tarjeta: first.precio_tarjeta != null ? Number(first.precio_tarjeta) : null,
        });
      }
    } catch {
      /* silent */
    }
  }, [q, hits, addToCart]);

  const updateCant = (id: string, cant: number) => {
    setCart((prev) => prev.map((x) => x.producto_id === id ? { ...x, cantidad: Math.max(1, cant) } : x));
  };
  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((x) => x.producto_id !== id));
    setUltimoAgregado((u) => (u && u.producto_id === id ? null : u));
  };
  const vaciarCarrito = () => {
    setCart([]);
    setUltimoAgregado(null);
    setClienteSel(null);
    setClienteQuery("");
    setClientesAbierto(false);
  };

  const total = useMemo(() => cart.reduce((s, it) => s + it.cantidad * precioEfectivo(it), 0), [cart]);
  const cantTotal = useMemo(() => cart.reduce((s, it) => s + it.cantidad, 0), [cart]);
  // Total con tarjeta: pintura usa precio_tarjeta; no-pintura aplica recargo 4%.
  const totalNoPinturaContado = useMemo(
    () => cart.reduce((s, it) => s + (it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0 ? 0 : it.cantidad * precioEfectivo(it)), 0),
    [cart]
  );
  const totalCobro = useMemo(() => {
    if (metodo !== "tarjeta") return total;
    // pintura con precio_tarjeta → ese precio; el resto → precioEfectivo + recargo 4%.
    const totalPinturaTarjeta = cart.reduce(
      (s, it) => s + (it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0 ? it.cantidad * it.precio_tarjeta : 0),
      0
    );
    return totalPinturaTarjeta + totalNoPinturaContado + calcularRecargoTarjeta(totalNoPinturaContado, "tarjeta");
  }, [cart, metodo, total, totalNoPinturaContado]);
  const recargoTarjeta = useMemo(
    () => calcularRecargoTarjeta(totalNoPinturaContado, metodo),
    [totalNoPinturaContado, metodo]
  );

  // Abrir modal
  function abrirCobro() {
    if (cart.length === 0) return;
    setCobroError(null);
    setMetodo("efectivo");
    setEfectivoRecibido("");
    setReferencia("");
    setTitular("");
    setEntidadId("");
    setEntidadQuery("");
    setFechaAcreditacion(new Date().toISOString().slice(0, 10));
    setCobroOpen(true);
  }

  // Confirmar cobro → crear venta + abrir ticket
  async function confirmarCobro() {
    if (cart.length === 0) return;
    setCobrando(true);
    setCobroError(null);
    try {
      // Sólo aplicamos recargo 4% sobre lo NO pintura; los ítems pintura ya
      // tienen su precio_tarjeta cargado por producto.
      const totalContadoNoPintura = cart.reduce(
        (s, it) => s + (it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0 ? 0 : it.cantidad * precioEfectivo(it)),
        0
      );
      const recargoTot = calcularRecargoTarjeta(totalContadoNoPintura, metodo);
      const factorRecargo = totalContadoNoPintura > 0 ? (totalContadoNoPintura + recargoTot) / totalContadoNoPintura : 1;
      const items: LineaVenta[] = cart.map((it) => {
        const usaPrecioTarjetaPintura = metodo === "tarjeta" && it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0;
        const precioBase = usaPrecioTarjetaPintura ? it.precio_tarjeta! : precioEfectivo(it);
        const precio = (recargoTot > 0 && !usaPrecioTarjetaPintura) ? precioBase * factorRecargo : precioBase;
        const esMay = esMayoristaAplicado(it);
        const subtotal = it.cantidad * precio;
        return {
          producto_id: it.producto_id,
          producto_nombre: it.producto_nombre,
          sku: it.sku,
          cantidad: it.cantidad,
          precio_venta_original: precio,
          precio_venta: precio,
          tipo_iva: "EXENTA",
          tipo_precio: esMay ? "mayorista" : "minorista",
          subtotal,
          monto_iva: 0,
          total_linea: subtotal,
        };
      });
      const subtotalTotal = items.reduce((s, it) => s + it.subtotal, 0);
      const entidadSel = entidades.find((e) => e.id === entidadId);
      const pagoDetalle = metodo === "efectivo"
        ? null
        : {
            entidad_bancaria_id: entidadId || null,
            entidad_nombre_snapshot: entidadSel?.nombre ?? null,
            referencia: referencia.trim() || null,
            titular: metodo === "transferencia" ? (titular.trim() || null) : null,
            fecha_acreditacion: fechaAcreditacion || null,
          };

      const res = await saveVenta({
        items,
        moneda: "GS",
        tipo_cambio: 1,
        subtotal: subtotalTotal,
        monto_iva: 0,
        total: subtotalTotal,
        tipo_venta: "CONTADO",
        metodo_pago: metodo,
        cliente_id: clienteSel?.id ?? null,
      }, undefined, pagoDetalle);
      if (!res.success) {
        setCobroError(res.error);
        return;
      }
      const v = res.venta;
      // Abrir ticket auto-print en pestaña nueva
      try { window.open(`/api/ventas/${v.id}/ticket?auto=1`, "_blank", "noopener"); } catch {}
      setVentaOk(v.numero_control);
      setCobroOpen(false);
      vaciarCarrito();
      setCajaRefreshTick((n) => n + 1);
      setTimeout(() => setVentaOk(null), 3500);
      inputRef.current?.focus();
    } catch (e) {
      setCobroError(e instanceof Error ? e.message : "No se pudo registrar la venta.");
    } finally {
      setCobrando(false);
    }
  }

  const diferenciaEfectivo = useMemo(() => {
    if (metodo !== "efectivo") return 0;
    const r = parseMontoInput(efectivoRecibido);
    if (!Number.isFinite(r) || r <= 0) return -totalCobro;
    return r - totalCobro;
  }, [efectivoRecibido, totalCobro, metodo]);
  const vuelto = diferenciaEfectivo > 0 ? diferenciaEfectivo : 0;
  const faltaEfectivo = diferenciaEfectivo < 0 ? -diferenciaEfectivo : 0;
  const efectivoIngresado = parseMontoInput(efectivoRecibido) > 0;

  // Auto-focus del buscador al montar y cuando la caja se abre
  useEffect(() => {
    if (cajaAbierta) inputRef.current?.focus();
  }, [cajaAbierta]);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" style={{ boxShadow: "0 0 0 3px rgba(79,174,178,0.18)" }} />
            Ferretería Chaco · Operaciones
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Caja</h1>
          <p className="mt-0.5 text-xs text-slate-500">Escaneá o buscá un producto y cobrálo directo.</p>
        </div>
        <Link
          href="/reportes/ventas-del-dia"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver órdenes del día →
        </Link>
      </div>

      <CajaControlPanel onStateChange={setCajaAbierta} refreshTrigger={cajaRefreshTick} />

      {/* Toast venta OK */}
      {ventaOk && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
          <CheckCircle2 className="h-5 w-5" /> Venta <strong>{ventaOk}</strong> registrada. Ticket enviado a imprimir.
        </div>
      )}

      {/* Split POS */}
      {!cajaAbierta ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Abrí la caja para empezar a cobrar.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:min-h-[540px]">
          {/* PANEL IZQUIERDO: buscador + carrito */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDownBuscar}
                  placeholder="Escaneá el código o buscá por nombre/SKU…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-base outline-none focus:border-[#4FAEB2] focus:bg-white focus:ring-2 focus:ring-[#4FAEB2]/20"
                  autoComplete="off"
                />
                {buscando && <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-slate-400" />}
              </div>

              {hits.length > 0 && (
                <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white shadow-inner">
                  {hits.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[#4FAEB2]/[0.08]"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt={p.nombre} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{p.nombre}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {p.sku}
                          {p.cantidad_minima_mayorista != null && p.cantidad_minima_mayorista > 0 && p.precio_mayorista > 0 && p.precio_mayorista !== p.precio_venta && (
                            <span className="ml-2 text-indigo-600">
                              · desde {p.cantidad_minima_mayorista} u {formatGs(p.precio_mayorista)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[11px] font-medium ${p.stock_actual <= 0 ? "text-rose-600" : "text-emerald-700"}`}>
                          {p.stock_actual <= 0 ? "Sin stock" : `${p.stock_actual} u`}
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{formatGs(p.precio_venta)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Sin resultados + oferta para asociar código */}
              {!buscando && q.trim().length >= 2 && hits.length === 0 && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm">
                  <p className="font-medium text-amber-900">
                    Ningún producto encontrado con <span className="font-mono">«{q.trim()}»</span>.
                  </p>
                  {/^[0-9]{6,}$/.test(q.trim()) && (
                    <>
                      <p className="mt-1 text-xs text-amber-800">
                        Parece un código de barras. ¿Querés asociarlo a un producto para que la próxima vez el scanner lo levante?
                      </p>
                      <button
                        type="button"
                        onClick={() => abrirAsociarCodigo(q.trim())}
                        className="mt-2 inline-flex items-center rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
                      >
                        Asociar código a un producto
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Carrito */}
            <div className="flex-1 overflow-auto p-4">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <Package className="h-8 w-8 text-slate-300" />
                  <p>Todavía no cargaste productos.</p>
                  <p className="text-xs">Escaneá o buscá arriba.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {cart.map((it) => (
                    <li key={it.producto_id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {it.imagen_url ? (
                            <img src={it.imagen_url} alt={it.producto_nombre} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{it.producto_nombre}</p>
                            {esMayoristaAplicado(it) && (
                              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 border border-indigo-200">
                                Mayorista
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[11px] text-slate-500">
                            {it.sku}
                            {" · "}
                            {formatGs(precioEfectivo(it))} c/u
                            {it.es_pintura && it.precio_tarjeta != null && it.precio_tarjeta > 0 && it.precio_tarjeta !== precioEfectivo(it) && (
                              <span className="ml-1 text-fuchsia-600">
                                (tarjeta {formatGs(it.precio_tarjeta)})
                              </span>
                            )}
                            {!esMayoristaAplicado(it) && it.precio_mayorista > 0 && it.precio_mayorista !== it.precio_venta && it.cantidad_minima_mayorista != null && it.cantidad_minima_mayorista > 0 && (
                              <span className="ml-1 text-indigo-500">
                                (desde {it.cantidad_minima_mayorista} u → {formatGs(it.precio_mayorista)})
                              </span>
                            )}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateCant(it.producto_id, it.cantidad - 1)}
                              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              aria-label="Menos"
                            >−</button>
                            <input
                              type="number"
                              min={1}
                              value={it.cantidad}
                              onChange={(e) => updateCant(it.producto_id, parseInt(e.target.value) || 1)}
                              className="h-7 w-14 rounded-md border border-slate-200 bg-white text-center text-sm tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => updateCant(it.producto_id, it.cantidad + 1)}
                              className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              aria-label="Más"
                            >+</button>
                            <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
                              {formatGs(it.cantidad * precioEfectivo(it))}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(it.producto_id)}
                          className="text-slate-400 hover:text-rose-500"
                          aria-label="Quitar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: logo/foto + botón cobrar */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
            {/* Área visual: branding Ferretería Chaco + foto producto. */}
            <div
              className="relative flex-1 min-h-[280px] rounded-t-2xl overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#164e63] to-[#4FAEB2]"
            >
              {/* Fallback textual: si no hay logo, mostramos el nombre grande de fondo. */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                <div className="w-full text-center px-4">
                  <p className="text-white/10 font-black uppercase tracking-tight leading-[0.9] text-[clamp(1.75rem,7vw,3.5rem)]">
                    Ferretería
                  </p>
                  <p className="text-white/25 font-black uppercase tracking-tight leading-[0.9] text-[clamp(1.75rem,7vw,3.5rem)]">
                    Chaco
                  </p>
                </div>
              </div>
              {/* Foto del último producto agregado, encima */}
              {ultimoAgregado && (
                <div className="relative z-10 flex h-full items-center justify-center p-6">
                  <div className="rounded-2xl border-2 border-white/20 bg-white/95 p-3 shadow-2xl">
                    {ultimoAgregado.imagen_url ? (
                      <img
                        src={ultimoAgregado.imagen_url}
                        alt={ultimoAgregado.producto_nombre}
                        className="h-56 w-56 object-contain"
                      />
                    ) : (
                      <div className="flex h-56 w-56 items-center justify-center text-slate-300">
                        <Package className="h-24 w-24" />
                      </div>
                    )}
                    <p className="mt-2 max-w-[224px] truncate text-center text-sm font-semibold text-slate-800">
                      {ultimoAgregado.producto_nombre}
                    </p>
                    <p className="text-center font-mono text-[10px] text-slate-400">{ultimoAgregado.sku}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Totales + botón */}
            <div className="border-t border-slate-100 p-5 space-y-3">
              {/* Selector de cliente */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</span>
                  {clienteSel && (
                    <button
                      type="button"
                      onClick={() => { setClienteSel(null); setClienteQuery(""); }}
                      className="text-[11px] text-slate-500 underline hover:text-slate-800"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {clienteSel ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">{clienteSel.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {clienteSel.ruc ? `RUC: ${clienteSel.ruc}` : clienteSel.documento ? `Doc: ${clienteSel.documento}` : "Sin RUC/Doc"}
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={clienteQuery}
                      onChange={(e) => { setClienteQuery(e.target.value); setClientesAbierto(true); }}
                      onFocus={() => setClientesAbierto(true)}
                      onBlur={() => setTimeout(() => setClientesAbierto(false), 150)}
                      placeholder="Consumidor final — buscá por nombre/RUC…"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                    {clientesAbierto && (
                      <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        <li className="border-b border-slate-100 bg-emerald-50/40">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={abrirCrearCliente}
                            className="block w-full px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            + Crear cliente{clienteQuery.trim() ? ` "${clienteQuery.trim()}"` : ""}
                          </button>
                        </li>
                        {clientesFiltrados.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setClienteSel(c); setClienteQuery(""); setClientesAbierto(false); }}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="font-medium text-slate-800">{c.nombre}</span>
                              {(c.ruc || c.documento) && (
                                <span className="ml-2 text-xs text-slate-500">
                                  {c.ruc ? `RUC ${c.ruc}` : `Doc ${c.documento}`}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                        {clientesFiltrados.length === 0 && (
                          <li className="px-3 py-2 text-xs text-slate-400">Sin resultados.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-baseline justify-between text-sm text-slate-500">
                <span>Ítems</span>
                <span className="font-medium tabular-nums text-slate-800">{cantTotal}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-slate-200 pt-3">
                <span className="text-sm font-medium text-slate-600">Total a cobrar</span>
                <span className="text-3xl font-bold tabular-nums text-slate-900">{formatGs(total)}</span>
              </div>
              <button
                type="button"
                onClick={abrirCobro}
                disabled={cart.length === 0}
                className="w-full rounded-xl bg-[#4FAEB2] px-5 py-4 text-lg font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                Aceptar y cobrar
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={vaciarCarrito}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  Vaciar carrito
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal crear cliente rápido */}
      {nuevoClienteOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!nuevoClienteGuardando) setNuevoClienteOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Nuevo cliente</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nombre / razón social *</label>
              <input
                type="text"
                autoFocus
                value={nuevoClienteNombre}
                onChange={(e) => setNuevoClienteNombre(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                placeholder="Ej: Juan Pérez o Constructora XYZ"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">RUC</label>
                <input
                  type="text"
                  value={nuevoClienteRuc}
                  onChange={(e) => setNuevoClienteRuc(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                  placeholder="80012345-6"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Documento</label>
                <input
                  type="text"
                  value={nuevoClienteDoc}
                  onChange={(e) => setNuevoClienteDoc(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                  placeholder="CI"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Teléfono</label>
              <input
                type="text"
                value={nuevoClienteTelefono}
                onChange={(e) => setNuevoClienteTelefono(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                placeholder="0981 123 456"
              />
            </div>
            {nuevoClienteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {nuevoClienteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={nuevoClienteGuardando}
                onClick={() => setNuevoClienteOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={nuevoClienteGuardando}
                onClick={crearClienteSubmit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {nuevoClienteGuardando ? "Guardando…" : "Crear y seleccionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cobro */}
      {cobroOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!cobrando) setCobroOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cobrar</h3>
              <p className="mt-1 text-sm text-slate-500">
                Total: <strong className="text-slate-900">{formatGs(totalCobro)}</strong> · {cantTotal} ítem{cantTotal === 1 ? "" : "s"}
              </p>
              {recargoTarjeta > 0 && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Contado <span className="tabular-nums">{formatGs(total)}</span>
                  {" + "}
                  <span className="tabular-nums">{formatGs(recargoTarjeta)}</span> recargo tarjeta ({Math.round(CARD_SURCHARGE_PCT * 100)}%)
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["efectivo", "transferencia", "tarjeta"] as MetodoPago[]).map((m) => {
                const label = m === "tarjeta" ? `Tarjeta (+${Math.round(CARD_SURCHARGE_PCT * 100)}%)` : m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodo(m)}
                    className={`rounded-lg border px-3 py-3 text-sm font-medium capitalize transition-colors ${
                      metodo === m
                        ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {metodo === "efectivo" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Efectivo recibido</span>
                  <MontoInput
                    value={efectivoRecibido}
                    onChange={(n) => setEfectivoRecibido(String(n))}
                    placeholder="0"
                    decimals={false}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-lg tabular-nums outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
                    autoFocus
                  />
                </label>
                {efectivoIngresado && faltaEfectivo > 0 ? (
                  <div className="flex items-baseline justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm">
                    <span className="font-medium text-rose-700">Falta</span>
                    <span className="text-xl font-bold tabular-nums text-rose-700">{formatGs(faltaEfectivo)}</span>
                  </div>
                ) : (
                  <div className={`flex items-baseline justify-between rounded-lg border px-3 py-2 text-sm ${
                    vuelto > 0
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  }`}>
                    <span className={vuelto > 0 ? "font-medium text-emerald-700" : "text-slate-600"}>Vuelto</span>
                    <span className={`text-xl font-bold tabular-nums ${vuelto > 0 ? "text-emerald-700" : "text-slate-900"}`}>
                      {formatGs(vuelto)}
                    </span>
                  </div>
                )}
              </>
            )}

            {(metodo === "transferencia" || metodo === "tarjeta") && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-800">
                  {metodo === "tarjeta" ? "Datos de tarjeta / débito" : "Datos de transferencia"}
                </p>

                {/* Typeahead entidad / banco */}
                <div className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    {metodo === "tarjeta" ? "Entidad / banco / POS" : "Entidad / banco"}
                  </span>
                  <input
                    type="text"
                    value={entidadQuery}
                    onChange={(e) => { setEntidadQuery(e.target.value); if (entidadId) setEntidadId(""); }}
                    placeholder="Buscar por código o nombre…"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
                  />
                  {entidadesTypeahead.length > 0 ? (
                    <ul className="mt-1 max-h-40 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {entidadesTypeahead.map((en) => {
                        const sel = en.id === entidadId;
                        return (
                          <li key={en.id}>
                            <button
                              type="button"
                              onClick={() => { setEntidadId(en.id); setEntidadQuery(""); }}
                              className={`flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${sel ? "bg-[#4FAEB2]/10" : ""}`}
                            >
                              {en.codigo && (
                                <span className="w-10 shrink-0 font-mono text-[11px] text-slate-500">{en.codigo}</span>
                              )}
                              <span className="text-slate-800">{en.nombre}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {entidadesFiltradas.length === 0
                        ? "Sin entidades cargadas. Configuralas en Configuración → Entidades bancarias."
                        : "Sin coincidencias."}
                    </p>
                  )}
                  {entidadSeleccionada && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Seleccionada: {entidadSeleccionada.nombre}
                    </p>
                  )}
                </div>

                {metodo === "transferencia" && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Titular que transfirió</span>
                    <input
                      type="text"
                      value={titular}
                      onChange={(e) => setTitular(e.target.value)}
                      placeholder="Nombre del titular"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
                    />
                  </label>
                )}

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">N° de comprobante / referencia</span>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Comprobante / transacción"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
                  />
                </label>
              </div>
            )}

            {cobroError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{cobroError}</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCobroOpen(false)}
                disabled={cobrando}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarCobro()}
                disabled={cobrando}
                className="rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {cobrando ? "Cobrando…" : "Confirmar e imprimir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: asociar código de barras a un producto existente */}
      {asociarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!asociarGuardando) setAsociarOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Asociar código a un producto</h3>
              <p className="mt-1 text-sm text-slate-500">
                Código escaneado: <span className="font-mono text-slate-800">{asociarCode}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Buscá el producto y hacé click para guardarle este código de barras.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={asociarQuery}
                onChange={(e) => setAsociarQuery(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
                autoFocus
                autoComplete="off"
              />
              {asociarBuscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              {asociarQuery.trim().length < 2 ? (
                <p className="p-4 text-center text-xs text-slate-400">Escribí al menos 2 caracteres para buscar.</p>
              ) : asociarHits.length === 0 && !asociarBuscando ? (
                <p className="p-4 text-center text-xs text-slate-400">Sin resultados.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {asociarHits.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => void asociarYAgregar(p)}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[#4FAEB2]/[0.08] ${
                        asociarGuardando ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt={p.nombre} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{p.nombre}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {p.sku}
                          {p.codigo_barras && (
                            <span className="ml-2 text-amber-600">· ya tiene código {p.codigo_barras}</span>
                          )}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{formatGs(p.precio_venta)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {asociarError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{asociarError}</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAsociarOpen(false)}
                disabled={asociarGuardando}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
