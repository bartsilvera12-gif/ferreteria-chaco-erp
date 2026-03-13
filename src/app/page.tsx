"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getConfig } from "@/lib/config/storage";
import { getUsuarios } from "@/lib/usuarios/storage";
import { getDashboardData } from "@/lib/dashboard/data";
import type { ConfigGlobal } from "@/lib/config/types";
import type { Usuario } from "@/lib/usuarios/types";
import type {
  ProspectoRaw,
  ClienteRaw,
  FacturaRaw,
  TipificacionRaw,
  ProductoRaw,
  VentaRaw,
  CompraRaw,
} from "@/lib/dashboard/data";

// ── Types ─────────────────────────────────────────────────────────────────────

type Periodo = "hoy" | "7d" | "30d" | "mes" | "anio";
type TabDash = "comercial" | "financiero" | "inventario" | "ventas";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGs(n: number): string {
  return n.toLocaleString("es-PY");
}

function formatGsM(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatFecha(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function hoyStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getRango(periodo: Periodo): { desde: Date; hasta: Date } {
  const hasta = new Date(); hasta.setHours(23, 59, 59, 999);
  const desde = new Date();
  switch (periodo) {
    case "hoy":  desde.setHours(0, 0, 0, 0); break;
    case "7d":   desde.setDate(desde.getDate() - 7); desde.setHours(0,0,0,0); break;
    case "30d":  desde.setDate(desde.getDate() - 30); desde.setHours(0,0,0,0); break;
    case "mes":  desde.setDate(1); desde.setHours(0,0,0,0); break;
    case "anio": desde.setMonth(0,1); desde.setHours(0,0,0,0); break;
  }
  return { desde, hasta };
}

function enRango(fechaStr: string, desde: Date, hasta: Date): boolean {
  const f = new Date(fechaStr);
  return !isNaN(f.getTime()) && f >= desde && f <= hasta;
}

function estadoEfectivo(f: FacturaRaw, hoy: string): string {
  if (f.saldo > 0 && f.fecha_vencimiento < hoy) return "Vencido";
  return f.estado;
}

// ── Componentes de gráficos ───────────────────────────────────────────────────

const ETAPA_COLORS: Record<string, string> = {
  LEAD:        "bg-slate-400",
  CONTACTADO:  "bg-[#0EA5E9]",
  NEGOCIACION: "bg-amber-400",
  GANADO:      "bg-[#0EA5E9]",
  PERDIDO:     "bg-red-400",
};

const ETAPA_LABELS: Record<string, string> = {
  LEAD: "Lead", CONTACTADO: "Contactado", NEGOCIACION: "Negociación",
  GANADO: "Ganado", PERDIDO: "Perdido",
};

function PipelineBar({
  data,
}: { data: { etapa: string; count: number; valor: number }[] }) {
  const maxC = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.etapa}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ETAPA_COLORS[d.etapa] ?? "bg-gray-400"}`} />
              <span className="text-xs font-medium text-gray-700">{ETAPA_LABELS[d.etapa] ?? d.etapa}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="tabular-nums font-semibold text-gray-700">{d.count}</span>
              <span className="tabular-nums w-20 text-right">Gs. {formatGsM(d.valor)}</span>
            </div>
          </div>
          <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${ETAPA_COLORS[d.etapa] ?? "bg-gray-400"}`}
              style={{ width: `${d.count > 0 ? Math.max((d.count / maxC) * 100, 4) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function HBarChart({
  data, color = "bg-blue-400",
}: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 truncate shrink-0" title={d.label}>{d.label}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all`}
              style={{ width: `${d.value > 0 ? Math.max((d.value / max) * 100, 3) : 0}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 w-8 text-right tabular-nums shrink-0">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">Sin datos</p>}
    </div>
  );
}

function AreaChart({
  data, color = "#6366f1",
}: { data: { label: string; value: number }[]; color?: string }) {
  if (data.length < 2) return <p className="text-xs text-gray-400 py-8 text-center">Sin datos suficientes</p>;
  const W = 480, H = 130, PL = 48, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const max = Math.max(...data.map(d => d.value), 1);
  const pts = data.map((d, i) => ({
    x: PL + (i / (data.length - 1)) * cW,
    y: PT + cH - (d.value / max) * cH,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)} L${PL},${(PT + cH).toFixed(1)} Z`;
  const yTicks = [0, Math.floor(max / 2), max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {yTicks.map((v, i) => {
        const y = PT + cH - (v / max) * cH;
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {formatGsM(v)}
            </text>
          </g>
        );
      })}
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />)}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={i} x={pts[i].x} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {d.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function DonutChart({
  segments,
}: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (total === 0) return (
    <div className="flex items-center gap-6">
      <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <span className="text-xs text-gray-400">Sin datos</span>
      </div>
    </div>
  );
  const R = 50, CX = 80, CY = 80, C = 2 * Math.PI * R;
  let cum = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-32 h-32 shrink-0">
        {segments.map((seg, i) => {
          if (seg.value === 0) return null;
          const pct  = seg.value / total;
          const dash = pct * C;
          const rot  = cum * 360 - 90;
          cum += pct;
          return (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none"
              stroke={seg.color} strokeWidth="22"
              strokeDasharray={`${dash} ${C - dash}`}
              transform={`rotate(${rot} ${CX} ${CY})`}
            />
          );
        })}
        <text x={CX} y={CY + 6} textAnchor="middle" fontSize="20" fontWeight="bold" fill="#1f2937">{total}</text>
        <text x={CX} y={CY + 18} textAnchor="middle" fontSize="9" fill="#9ca3af">facturas</text>
      </svg>
      <div className="space-y-2.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs text-gray-600 min-w-[60px]">{seg.label}</span>
            <span className="text-xs font-bold text-gray-800 tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ label, value, meta, format = "number" }: {
  label: string; value: number; meta: number; format?: "number" | "gs" | "pct";
}) {
  const pct = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
  const color = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-blue-500";
  const fmt = (n: number) =>
    format === "gs"  ? `Gs. ${formatGsM(n)}` :
    format === "pct" ? `${n.toFixed(1)}%`    : String(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {fmt(value)} <span className="text-gray-300">/</span> {fmt(meta)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% de la meta</p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "text-[#0F172A]", icon, variation,
}: { label: string; value: string; sub?: string; color?: string; icon: string; variation?: number }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 p-6 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-2xl">{icon}</div>
        {variation !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              variation >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
            }`}
          >
            {variation >= 0 ? "+" : ""}{variation}%
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold mt-3 tabular-nums ${color}`}>{value}</p>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </motion.div>
  );
}

// ── Dashboard Comercial ───────────────────────────────────────────────────────

function DashComercial({
  prospectos, clientes, tipificaciones, usuario, periodo, config,
}: {
  prospectos:     ProspectoRaw[];
  clientes:       ClienteRaw[];
  tipificaciones: TipificacionRaw[];
  usuario:        Usuario | null;
  periodo:        Periodo;
  config:         ConfigGlobal;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  // Filtrar por área si es supervisor
  const isSupervisor = usuario?.nivel === "supervisor";
  const area         = usuario?.area;

  const prospectosFilt = useMemo(() =>
    prospectos.filter((p) => {
      if (isSupervisor && area === "ventas" && p.responsable)
        return p.responsable.toUpperCase() === usuario?.nombre.toUpperCase();
      return true;
    }),
    [prospectos, isSupervisor, area, usuario]
  );

  // KPIs periodo
  const leadsNuevos    = prospectosFilt.filter(p => enRango(p.fecha_creacion, desde, hasta)).length;
  const enNegociacion  = prospectosFilt.filter(p => p.etapa === "NEGOCIACION").length;
  const clientesGanados= clientes.filter(c => enRango(c.created_at, desde, hasta)).length;
  const tasaConversion = leadsNuevos > 0 ? (clientesGanados / leadsNuevos) * 100 : 0;

  // Pipeline por etapa (snapshot actual)
  const ETAPAS = ["LEAD", "CONTACTADO", "NEGOCIACION", "GANADO", "PERDIDO"];
  const pipeline = ETAPAS.map(etapa => ({
    etapa,
    count: prospectosFilt.filter(p => p.etapa === etapa).length,
    valor: prospectosFilt.filter(p => p.etapa === etapa)
      .reduce((s, p) => s + (p.valor_estimado ?? 0), 0),
  }));

  // Rendimiento por usuario (clientes ganados)
  const rendimiento = useMemo(() => {
    const map: Record<string, number> = {};
    clientes
      .filter(c => enRango(c.created_at, desde, hasta))
      .forEach(c => {
        const v = c.vendedor_asignado ?? "Sin asignar";
        map[v] = (map[v] ?? 0) + 1;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [clientes, desde, hasta]);

  // Top clientes por origen
  const topClientes = useMemo(() =>
    clientes
      .filter(c => enRango(c.created_at, desde, hasta))
      .slice(0, 8)
      .map(c => ({
        nombre: c.empresa ?? c.nombre_contacto,
        codigo: c.codigo_cliente,
        origen: c.origen,
      })),
    [clientes, desde, hasta]
  );

  // Timeline de actividad
  const timeline = useMemo(() => {
    type Evento = { fecha: string; tipo: string; texto: string; color: string };
    const eventos: Evento[] = [];
    prospectos
      .filter(p => enRango(p.fecha_creacion, desde, hasta))
      .forEach(p => eventos.push({
        fecha: p.fecha_creacion,
        tipo: "Lead creado",
        texto: p.empresa,
        color: "bg-blue-100 text-blue-700",
      }));
    clientes
      .filter(c => enRango(c.created_at, desde, hasta))
      .forEach(c => eventos.push({
        fecha: c.created_at,
        tipo: "Cliente ganado",
        texto: c.empresa ?? c.nombre_contacto,
        color: "bg-green-100 text-green-700",
      }));
    tipificaciones
      .filter(t => enRango(t.fecha, desde, hasta))
      .forEach(t => eventos.push({
        fecha: t.fecha,
        tipo: "Tipificación",
        texto: t.tipo_gestion,
        color: "bg-violet-100 text-violet-700",
      }));
    return eventos
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 12);
  }, [prospectos, clientes, tipificaciones, desde, hasta]);

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="🎯" label="Leads nuevos"      value={String(leadsNuevos)} color="text-[#0EA5E9]" variation={12} />
        <KpiCard icon="💬" label="En negociación"    value={String(enNegociacion)} color="text-amber-600" />
        <KpiCard icon="✅" label="Clientes ganados"  value={String(clientesGanados)} color="text-[#0EA5E9]" variation={8} />
        <KpiCard icon="📈" label="Tasa de conversión" value={`${tasaConversion.toFixed(1)}%`}
          color={tasaConversion >= config.meta_conversion_leads ? "text-[#0EA5E9]" : "text-[#0F172A]"}
          variation={tasaConversion >= config.meta_conversion_leads ? 5 : -2} />
      </div>

      {/* Metas comerciales */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Progreso de metas</h3>
        <div className="grid grid-cols-2 gap-6">
          <ProgressBar label="Clientes nuevos" value={clientesGanados}
            meta={config.meta_clientes_nuevos} />
          <ProgressBar label="Conversión de leads" value={tasaConversion}
            meta={config.meta_conversion_leads} format="pct" />
        </div>
      </div>

      {/* Pipeline + Rendimiento */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Pipeline CRM</h3>
          <PipelineBar data={pipeline} />
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Clientes ganados por vendedor
          </h3>
          <HBarChart data={rendimiento} color="bg-[#0EA5E9]" />
        </motion.div>
      </div>

      {/* Top clientes + Timeline */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Clientes del periodo
          </h3>
          {topClientes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin clientes en el periodo</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 pb-2">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-400 pb-2">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topClientes.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 text-xs font-medium text-gray-800 truncate max-w-[140px]">{c.nombre}</td>
                    <td className="py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.origen}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Actividad reciente
          </h3>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin actividad en el periodo</p>
          ) : (
            <div className="space-y-2.5">
              {timeline.map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${e.color}`}>
                    {e.tipo}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{e.texto}</p>
                    <p className="text-xs text-gray-400">{formatFecha(e.fecha)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

    </div>
  );
}

// ── Dashboard Financiero ──────────────────────────────────────────────────────

function DashFinanciero({
  facturas, clientes, periodo, config,
}: {
  facturas:  FacturaRaw[];
  clientes:  ClienteRaw[];
  periodo:   Periodo;
  config:    ConfigGlobal;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);
  const hoy = hoyStr();

  // KPIs
  const facturasPeriodo = facturas.filter(f => enRango(f.fecha, desde, hasta));
  const facturado       = facturasPeriodo.reduce((s, f) => s + f.monto, 0);
  const cobrado         = facturasPeriodo.reduce((s, f) => s + (f.monto - f.saldo), 0);
  const saldoPendiente  = facturas.filter(f => f.saldo > 0).reduce((s, f) => s + f.saldo, 0);
  const cntVencidas     = facturas.filter(f => estadoEfectivo(f, hoy) === "Vencido").length;

  // Facturación mensual (últimos 12 meses)
  const mensual = useMemo(() => {
    const result: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      const value = facturas
        .filter(f => { const fd = new Date(f.fecha); return fd.getFullYear() === y && fd.getMonth() + 1 === m; })
        .reduce((s, f) => s + f.monto, 0);
      result.push({ label: `${String(m).padStart(2,"0")}/${String(y).slice(2)}`, value });
    }
    return result;
  }, [facturas]);

  // Distribución facturas (todo el tiempo)
  const pagadas    = facturas.filter(f => estadoEfectivo(f, hoy) === "Pagado").length;
  const pendientes = facturas.filter(f => estadoEfectivo(f, hoy) === "Pendiente").length;
  const vencidas   = facturas.filter(f => estadoEfectivo(f, hoy) === "Vencido").length;

  // Mapa de clientes para join
  const clienteMap = useMemo(() =>
    Object.fromEntries(clientes.map(c => [c.id, c.empresa ?? c.nombre_contacto])),
    [clientes]
  );

  // Facturas críticas (mayor saldo vencido)
  const criticas = useMemo(() =>
    facturas
      .filter(f => estadoEfectivo(f, hoy) === "Vencido")
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10),
    [facturas, hoy]
  );

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="🧾" label="Facturado" value={`Gs. ${formatGsM(facturado)}`} color="text-[#0EA5E9]"
          sub={`${facturasPeriodo.length} facturas`} variation={15} />
        <KpiCard icon="💵" label="Cobrado" value={`Gs. ${formatGsM(cobrado)}`} color="text-[#0EA5E9]" variation={8} />
        <KpiCard icon="⏳" label="Saldo pendiente" value={`Gs. ${formatGsM(saldoPendiente)}`}
          color={saldoPendiente > 0 ? "text-amber-600" : "text-[#0EA5E9]"} />
        <KpiCard icon="🚨" label="Facturas vencidas" value={String(cntVencidas)}
          color={cntVencidas > 0 ? "text-red-600" : "text-[#0EA5E9]"}
          variation={cntVencidas > 0 ? -3 : undefined} />
      </div>

      {/* Metas financieras */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Progreso de metas</h3>
        <div className="grid grid-cols-2 gap-6">
          <ProgressBar label="Facturación mensual"
            value={facturas
              .filter(f => { const d = new Date(f.fecha); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); })
              .reduce((s, f) => s + f.monto, 0)}
            meta={config.meta_facturacion_mensual} format="gs" />
          <ProgressBar label="Ventas mensuales"
            value={facturas
              .filter(f => { const d = new Date(f.fecha); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); })
              .reduce((s, f) => s + (f.monto - f.saldo), 0)}
            meta={config.meta_ventas_mensuales} format="gs" />
        </div>
      </div>

      {/* Gráfico mensual + Distribución */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div whileHover={{ y: -2 }} className="col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Facturación mensual — últimos 12 meses
          </h3>
          <AreaChart data={mensual} color="#0EA5E9" />
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Distribución de facturas
          </h3>
          <DonutChart segments={[
            { label: "Pagadas",   value: pagadas,    color: "#22c55e" },
            { label: "Pendientes",value: pendientes,  color: "#f59e0b" },
            { label: "Vencidas",  value: vencidas,    color: "#ef4444" },
          ]} />
        </motion.div>
      </div>

      {/* Tabla facturas críticas */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Facturas críticas — mayor saldo vencido
        </h3>
        {criticas.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg px-4 py-3 text-sm">
            <span>✅</span> No hay facturas vencidas. ¡Todo al día!
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                  </th>
                  {["Cliente", "Nro. Factura", "Fecha venc.", "Estado", "Saldo"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-3 py-3 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {criticas.map((f) => (
                  <tr key={f.id} className="bg-red-50/30 dark:bg-red-900/10 hover:bg-red-50/60 dark:hover:bg-red-900/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {clienteMap[f.cliente_id] ?? `Cliente #${f.cliente_id}`}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">{f.numero_factura}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{formatFecha(f.fecha_vencimiento)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                        Vencido
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-bold text-red-700 dark:text-red-400 tabular-nums">
                      Gs. {formatGs(f.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Dashboard Inventario ─────────────────────────────────────────────────────

function DashInventario({
  productos,
  compras,
}: {
  productos: ProductoRaw[];
  compras:   CompraRaw[];
}) {
  const totalProductos = productos.length;
  const totalUnidades  = productos.reduce((s, p) => s + p.stock_actual, 0);
  const bajosStock     = productos.filter(p => p.stock_actual <= p.stock_minimo).length;
  const valorTotal     = productos.reduce((s, p) => s + p.stock_actual * p.costo_promedio, 0);

  const cntSaludable = productos.filter(p => p.stock_actual > p.stock_minimo).length;
  const cntBajo      = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length;
  const cntCritico   = productos.filter(p => p.stock_actual <= 0).length;

  const proveedorMap = useMemo(() => {
    const map: Record<string, string> = {};
    compras.forEach(c => { if (c.producto_id) map[String(c.producto_id)] = c.proveedor_nombre; });
    return map;
  }, [compras]);

  const criticos = useMemo(() =>
    productos
      .filter(p => p.stock_actual <= p.stock_minimo)
      .sort((a, b) => a.stock_actual - b.stock_actual)
      .slice(0, 10),
    [productos]
  );

  const topPorValor = useMemo(() =>
    [...productos]
      .map(p => ({ ...p, valor: p.stock_actual * p.costo_promedio }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    [productos]
  );

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="📦" label="Productos totales"      value={String(totalProductos)} color="text-[#0EA5E9]" variation={4} />
        <KpiCard icon="🔢" label="Stock total (unidades)" value={formatGs(totalUnidades)} color="text-[#0EA5E9]" />
        <KpiCard icon="⚠️" label="Bajo stock mínimo"      value={String(bajosStock)}
          sub={bajosStock > 0 ? "requieren reposición" : "todo en orden"}
          color={bajosStock > 0 ? "text-red-600" : "text-[#0EA5E9]"}
          variation={bajosStock > 0 ? -2 : undefined} />
        <KpiCard icon="💎" label="Valor del inventario"   value={`Gs. ${formatGsM(valorTotal)}`} color="text-[#0EA5E9]" variation={12} />
      </div>

      {/* Donut + Críticos */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Estado del stock</h3>
          <DonutChart segments={[
            { label: "Saludable", value: cntSaludable, color: "#22c55e" },
            { label: "Bajo",      value: cntBajo,      color: "#f59e0b" },
            { label: "Crítico",   value: cntCritico,   color: "#ef4444" },
          ]} />
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
            Productos críticos — stock bajo mínimo
          </h3>
          {criticos.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg px-4 py-3 text-sm">
              <span>✅</span> Todos los productos tienen stock suficiente.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                    </th>
                    {["Producto", "Stock actual", "Stock mín.", "Estado", "Proveedor"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-3 py-3 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {criticos.map(p => (
                    <tr key={p.id} className={`${p.stock_actual <= 0 ? "bg-red-50/40 dark:bg-red-900/10" : "bg-amber-50/30 dark:bg-amber-900/10"} hover:bg-opacity-80 transition-colors`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">{p.nombre}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-bold tabular-nums ${p.stock_actual <= 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {p.stock_actual} {p.unidad_medida}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{p.stock_minimo} {p.unidad_medida}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.stock_actual <= 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        }`}>
                          {p.stock_actual <= 0 ? "Crítico" : "Bajo"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{proveedorMap[String(p.id)] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Top por valor */}
      <motion.div whileHover={{ y: -2 }} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 transition-shadow hover:shadow-md">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Top productos por valor de inventario
        </h3>
        {topPorValor.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin productos registrados.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                  </th>
                  {["Producto", "SKU", "Stock", "Costo promedio", "Valor inventario"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-3 py-3 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topPorValor.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">{p.nombre}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{p.sku}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">{p.stock_actual}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">Gs. {formatGs(p.costo_promedio)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-slate-800 dark:text-slate-200">Gs. {formatGs(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

    </div>
  );
}

// ── Dashboard Ventas ──────────────────────────────────────────────────────────

function DashVentas({
  ventas,
  productos,
  periodo,
}: {
  ventas:    VentaRaw[];
  productos: ProductoRaw[];
  periodo:   Periodo;
}) {
  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  const ventasFilt = useMemo(() =>
    ventas.filter(v => enRango(v.fecha, desde, hasta)),
    [ventas, desde, hasta]
  );

  const ventasHoy = useMemo(() => {
    const { desde: d, hasta: h } = getRango("hoy");
    return ventas.filter(v => enRango(v.fecha, d, h));
  }, [ventas]);

  const ventasMes = useMemo(() => {
    const { desde: d, hasta: h } = getRango("mes");
    return ventas.filter(v => enRango(v.fecha, d, h));
  }, [ventas]);

  const totalHoy   = ventasHoy.reduce((s, v) => s + v.total, 0);
  const totalMes   = ventasMes.reduce((s, v) => s + v.total, 0);
  const ticketProm = ventasFilt.length > 0 ? ventasFilt.reduce((s, v) => s + v.total, 0) / ventasFilt.length : 0;
  const unidades   = ventasFilt.flatMap(v => v.lineas ?? []).reduce((s, l) => s + (l?.cantidad ?? 0), 0);

  const prodMap = useMemo(() =>
    Object.fromEntries(productos.map(p => [p.id, p])),
    [productos]
  );

  const gananciaHoy = useMemo(() =>
    ventasHoy.flatMap(v => v.lineas ?? []).reduce((s, l) => {
      if (!l) return s;
      const costo = prodMap[l.producto_id]?.costo_promedio ?? 0;
      return s + (l.precio_venta - costo) * l.cantidad;
    }, 0),
    [ventasHoy, prodMap]
  );

  const totalHoyBruto = ventasHoy.flatMap(v => v.lineas ?? [])
    .reduce((s, l) => s + (l ? l.precio_venta * l.cantidad : 0), 0);

  const margenProm = totalHoyBruto > 0 ? (gananciaHoy / totalHoyBruto) * 100 : 0;

  const topProductos = useMemo(() => {
    const map: Record<string, number> = {};
    ventasFilt.flatMap(v => v.lineas ?? []).filter(Boolean).forEach(l => {
      map[l.producto_nombre] = (map[l.producto_nombre] ?? 0) + l.cantidad;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [ventasFilt]);

  const ventasPorHora = useMemo(() => {
    const horas = Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, "0")}h`,
      value: 0,
    }));
    ventasHoy.forEach(v => {
      const h = new Date(v.fecha).getHours();
      if (h >= 0 && h < 24) horas[h].value += v.total;
    });
    const ahora = new Date().getHours();
    return horas.slice(0, ahora + 1);
  }, [ventasHoy]);

  const desglose = useMemo(() => {
    const tipos = ["CONTADO", "CREDITO"] as const;
    return tipos.map(tipo => {
      const lst = ventasFilt.filter(v => v.tipo_venta === tipo);
      const total = lst.reduce((s, v) => s + v.total, 0);
      const unid  = lst.flatMap(v => v.lineas ?? []).reduce((s, l) => s + (l?.cantidad ?? 0), 0);
      return { tipo, ventas: lst.length, total, ticket: lst.length ? total / lst.length : 0, unid };
    });
  }, [ventasFilt]);

  return (
    <div className="space-y-5">

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon="📅" label="Ventas del día"    value={`Gs. ${formatGsM(totalHoy)}`}
          sub={`${ventasHoy.length} transacciones`} color="text-blue-600" />
        <KpiCard icon="📆" label="Ventas del mes"    value={`Gs. ${formatGsM(totalMes)}`}
          sub={`${ventasMes.length} transacciones`} color="text-indigo-600" />
        <KpiCard icon="🎫" label="Ticket promedio"   value={`Gs. ${formatGsM(ticketProm)}`}
          sub={`periodo: ${periodo}`} />
        <KpiCard icon="📦" label="Unidades vendidas" value={formatGs(unidades)}
          sub={`en el periodo`} />
      </div>

      {/* KPIs rentabilidad */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${gananciaHoy >= 0 ? "text-green-600" : "text-red-600"}`}>
              Gs. {formatGsM(gananciaHoy)}
            </p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">Ganancia del día</p>
            <p className="text-xs text-gray-400">precio venta − costo promedio × cant.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <p className={`text-2xl font-bold tabular-nums ${margenProm >= 20 ? "text-green-600" : margenProm >= 10 ? "text-amber-600" : "text-red-600"}`}>
              {margenProm.toFixed(1)}%
            </p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">Margen promedio (hoy)</p>
            <p className="text-xs text-gray-400">ganancia / precio venta</p>
          </div>
        </div>
      </div>

      {/* Productos más vendidos + Ventas por hora */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Productos más vendidos
          </h3>
          {topProductos.length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">Sin ventas en el periodo.</p>
            : <HBarChart data={topProductos} color="bg-indigo-400" />
          }
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Ventas por hora — hoy
          </h3>
          {ventasPorHora.every(h => h.value === 0)
            ? <p className="text-sm text-gray-400 text-center py-6">Sin ventas registradas hoy.</p>
            : <AreaChart data={ventasPorHora} color="#10b981" />
          }
        </div>
      </div>

      {/* Desglose por tipo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          Desglose por tipo de venta
        </h3>
        {ventasFilt.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin ventas en el periodo seleccionado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Tipo", "Cantidad", "Total", "Ticket promedio", "Unidades"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {desglose.map(r => (
                <tr key={r.tipo} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.tipo === "CONTADO" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {r.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-700">{r.ventas}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-gray-800">Gs. {formatGs(r.total)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">Gs. {formatGs(Math.round(r.ticket))}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">{r.unid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

const PERIODO_OPTS: { id: Periodo; label: string }[] = [
  { id: "hoy",  label: "Hoy"       },
  { id: "7d",   label: "7 días"    },
  { id: "30d",  label: "30 días"   },
  { id: "mes",  label: "Mes actual"},
  { id: "anio", label: "Año"       },
];

export default function DashboardPage() {
  const [tab,      setTab]      = useState<TabDash>("comercial");
  const [periodo,  setPeriodo]  = useState<Periodo>("mes");
  const [config,   setConfig]   = useState<ConfigGlobal | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioId, setUsuarioId] = useState<number | null>(null);

  const [prospectos,     setProspectos]     = useState<ProspectoRaw[]>([]);
  const [clientes,       setClientes]       = useState<ClienteRaw[]>([]);
  const [facturas,       setFacturas]       = useState<FacturaRaw[]>([]);
  const [tipificaciones, setTipificaciones] = useState<TipificacionRaw[]>([]);
  const [productos,      setProductos]      = useState<ProductoRaw[]>([]);
  const [ventas,         setVentas]         = useState<VentaRaw[]>([]);
  const [compras,        setCompras]        = useState<CompraRaw[]>([]);

  useEffect(() => {
    setConfig(getConfig());
    const us = getUsuarios();
    setUsuarios(us);

    // Cargar sesión activa o default al primer admin
    const saved = localStorage.getItem("neura_dash_usuario");
    const savedId = saved ? parseInt(saved, 10) : null;
    const defaultUser = us.find(u => u.nivel === "administrador") ?? us[0] ?? null;
    setUsuarioId(savedId ?? defaultUser?.id ?? null);

    // Datos de módulos desde Supabase
    getDashboardData()
      .then((data) => {
        setProspectos(data.prospectos);
        setClientes(data.clientes);
        setFacturas(data.facturas);
        setTipificaciones(data.tipificaciones);
        setProductos(data.productos);
        setVentas(data.ventas);
        setCompras(data.compras);
      })
      .catch(() => {
        setProspectos([]);
        setClientes([]);
        setFacturas([]);
        setTipificaciones([]);
        setProductos([]);
        setVentas([]);
        setCompras([]);
      });
  }, []);

  function handleUsuarioChange(id: number) {
    setUsuarioId(id);
    localStorage.setItem("neura_dash_usuario", String(id));
  }

  const usuarioActivo = usuarios.find(u => u.id === usuarioId) ?? null;
  const nivel = usuarioActivo?.nivel ?? "administrador";

  if (!config) {
    return <div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando…</div>;
  }

  // Control de acceso
  if (nivel === "usuario") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="text-4xl">🔒</span>
        <h2 className="text-lg font-bold text-gray-800">Acceso restringido</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          El dashboard solo está disponible para usuarios con nivel <strong>Supervisor</strong> o <strong>Administrador</strong>.
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
          Cambiar a:
          {usuarios.filter(u => u.nivel !== "usuario").map(u => (
            <button key={u.id} onClick={() => handleUsuarioChange(u.id)}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors">
              {u.nombre}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vista {nivel === "supervisor" ? "de tu área" : "global"} del sistema
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Sesión simulada */}
          {usuarios.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Viendo como:</span>
              <select
                value={usuarioId ?? ""}
                onChange={(e) => handleUsuarioChange(parseInt(e.target.value, 10))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20"
              >
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.nivel})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Periodo */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {PERIODO_OPTS.map(p => (
              <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  periodo === p.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-900 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 p-1.5 w-fit flex-wrap">
        {([
          { id: "comercial",   label: "Comercial",   icon: "📊" },
          { id: "financiero",  label: "Financiero",  icon: "💰" },
          { id: "inventario",  label: "Inventario",  icon: "📦" },
          { id: "ventas",      label: "Ventas",      icon: "🛒" },
        ] as { id: TabDash; label: string; icon: string }[]).map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-full transition-all ${
              tab === t.id ? "bg-[#0EA5E9] text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "comercial" && (
        <DashComercial
          prospectos={prospectos}
          clientes={clientes}
          tipificaciones={tipificaciones}
          usuario={usuarioActivo}
          periodo={periodo}
          config={config}
        />
      )}

      {tab === "financiero" && (
        <DashFinanciero
          facturas={facturas}
          clientes={clientes}
          periodo={periodo}
          config={config}
        />
      )}

      {tab === "inventario" && (
        <DashInventario
          productos={productos}
          compras={compras}
        />
      )}

      {tab === "ventas" && (
        <DashVentas
          ventas={ventas}
          productos={productos}
          periodo={periodo}
        />
      )}

    </div>
  );
}
