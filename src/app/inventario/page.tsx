"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

export default function InventarioPage() {
  const [todos, setTodos] = useState<Producto[]>([]);

  // Filtros por columna
  const [filtroPorNombre,  setFiltroPorNombre]  = useState("");
  const [filtroPorSku,     setFiltroPorSku]     = useState("");
  const [filtroPorCosto,   setFiltroPorCosto]   = useState("");
  const [filtroPorPrecio,  setFiltroPorPrecio]  = useState("");
  const [filtroValuacion,  setFiltroValuacion]  = useState<MetodoValuacion | "">("");
  const [soloStockBajo,    setSoloStockBajo]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    return () => { cancelled = true; };
  }, []);

  const productos = todos.filter((p) => {
    // Nombre
    if (filtroPorNombre.trim() !== "" &&
        !p.nombre.toLowerCase().includes(filtroPorNombre.toLowerCase().trim()))
      return false;

    // SKU
    if (filtroPorSku.trim() !== "" &&
        !p.sku.toLowerCase().includes(filtroPorSku.toLowerCase().trim()))
      return false;

    // Costo promedio — acepta "35000" o "35.000"
    if (filtroPorCosto.trim() !== "") {
      const t = filtroPorCosto.trim();
      const coincide =
        String(p.costo_promedio).includes(t) ||
        p.costo_promedio.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Precio venta — acepta "75000" o "75.000"
    if (filtroPorPrecio.trim() !== "") {
      const t = filtroPorPrecio.trim();
      const coincide =
        String(p.precio_venta).includes(t) ||
        p.precio_venta.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Valuación
    if (filtroValuacion !== "" && p.metodo_valuacion !== filtroValuacion) return false;

    // Solo stock bajo
    if (soloStockBajo && p.stock_actual > p.stock_minimo) return false;

    return true;
  });

  const hayFiltrosActivos =
    filtroPorNombre || filtroPorSku || filtroPorCosto ||
    filtroPorPrecio || filtroValuacion || soloStockBajo;

  function limpiarFiltros() {
    setFiltroPorNombre("");
    setFiltroPorSku("");
    setFiltroPorCosto("");
    setFiltroPorPrecio("");
    setFiltroValuacion("");
    setSoloStockBajo(false);
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
        <p className="text-gray-600">Gestión de productos y control de stock</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6">

        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Productos</h2>
            <Link
              href="/inventario/nuevo"
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Nuevo producto
            </Link>
          </div>
          <p className="text-xs text-gray-400">
            Los productos ingresan desde <span className="font-medium text-gray-500">Compras</span>
          </p>
        </div>

        {/* Filtros por columna */}
        <div className="space-y-3 mb-5 pb-5 border-b border-gray-100">

          {/* Fila 1: filtros de texto por columna */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Buscar nombre..."
                value={filtroPorNombre}
                onChange={(e) => setFiltroPorNombre(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input
                type="text"
                placeholder="Buscar SKU..."
                value={filtroPorSku}
                onChange={(e) => setFiltroPorSku(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Costo promedio</label>
              <input
                type="text"
                placeholder="Ej: 35000"
                value={filtroPorCosto}
                onChange={(e) => setFiltroPorCosto(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Precio venta</label>
              <input
                type="text"
                placeholder="Ej: 75000"
                value={filtroPorPrecio}
                onChange={(e) => setFiltroPorPrecio(e.target.value)}
                className={inputFilterClass}
              />
            </div>
          </div>

          {/* Fila 2: valuación, stock bajo, limpiar y contador */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valuación</label>
              <select
                value={filtroValuacion}
                onChange={(e) => setFiltroValuacion(e.target.value as MetodoValuacion | "")}
                className={inputFilterClass}
              >
                <option value="">Todos los métodos</option>
                <option value="CPP">CPP</option>
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none mt-4">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded"
              />
              Solo stock bajo
            </label>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
              >
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-sm text-gray-400 self-end mb-0.5">
              {productos.length} de {todos.length} productos
            </span>
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium text-center">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium">Valuación</th>
                <th className="py-3 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 font-medium w-20"></th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-4 pr-4 font-medium text-gray-800">{p.nombre}</td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500">{p.stock_minimo}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.unidad_medida}</td>
                    <td className="py-4 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge[p.metodo_valuacion]}`}>
                        {p.metodo_valuacion}
                      </span>
                    </td>
                    <td className={`py-4 text-right tabular-nums font-semibold ${margenColor(margen)}`}>
                      {margen.toFixed(2)}%
                    </td>
                    <td className="py-4">
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="text-sm text-gray-500 hover:text-gray-800 underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

      </div>

    </div>
  );
}
