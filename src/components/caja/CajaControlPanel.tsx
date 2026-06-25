"use client";

import { useCallback, useEffect, useState } from "react";
import MontoInput from "@/components/ui/MontoInput";
import {
  abrirCaja,
  cerrarCaja,
  getCajasAbiertas,
  getResumenCaja,
  registrarMovimiento,
} from "@/lib/caja/storage";
import type { Caja, CajaResumen, MedioPagoCaja, TipoMovimientoCaja } from "@/lib/caja/types";
import { getCurrentUser } from "@/lib/auth";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatFechaHora(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PY", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white text-sm";

type ModalKind = null | "abrir" | "cerrar" | "mov";

/** Hasta 3 cajas concurrentes — una por estación física (1, 2, 3). */
const NUMEROS_CAJA = [1, 2, 3] as const;

export default function CajaControlPanel({
  onStateChange,
}: {
  /** Notifica al padre si HAY ALGUNA caja abierta (cualquier estación). */
  onStateChange?: (algunaAbierta: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaAsignada, setCajaAsignada] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const lista = await getCajasAbiertas();
    setCajas(lista);
    onStateChange?.(lista.length > 0);
    setLoading(false);
  }, [onStateChange]);

  useEffect(() => {
    void refresh();
    let cancelled = false;
    // Resolver caja asignada — preferimos /api/usuarios/me porque tiene fallback
    // server-side cuando PostgREST aún no conoce la columna. Si ese endpoint no
    // la trae, intentamos getCurrentUser como backup.
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" });
        const j = await r.json();
        const nca = j?.usuario?.numero_caja_asignada;
        if (!cancelled && typeof nca === "number" && nca >= 1 && nca <= 3) {
          setCajaAsignada(nca);
          return;
        }
      } catch { /* fallback */ }
      try {
        const cu = await getCurrentUser();
        if (cancelled) return;
        if (cu?.numero_caja_asignada != null) {
          const n = Number(cu.numero_caja_asignada);
          if (Number.isInteger(n) && n >= 1 && n <= 3) setCajaAsignada(n);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  if (loading && cajas.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400 shadow-sm">
        Cargando estado de cajas…
      </div>
    );
  }

  // Si el cajero tiene caja asignada, solo mostrar SU caja (no las 3).
  const numerosVisibles = cajaAsignada != null ? [cajaAsignada] : NUMEROS_CAJA;
  const gridCols = numerosVisibles.length === 1 ? "" : "lg:grid-cols-3";

  return (
    <div className={`grid gap-3 ${gridCols}`}>
      {numerosVisibles.map((n) => (
        <CajaSlotCard
          key={n}
          numeroCaja={n}
          caja={cajas.find((c) => c.numero_caja === n) ?? null}
          onRefresh={refresh}
        />
      ))}
    </div>
  );
}

function CajaSlotCard({
  numeroCaja,
  caja,
  onRefresh,
}: {
  numeroCaja: number;
  caja: Caja | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [resumen, setResumen] = useState<CajaResumen | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  useEffect(() => {
    let cancelled = false;
    if (caja) {
      void getResumenCaja(caja.id).then((r) => { if (!cancelled) setResumen(r); });
    } else {
      setResumen(null);
    }
    return () => { cancelled = true; };
  }, [caja]);

  const after = async () => { setModal(null); await onRefresh(); };

  if (!caja) {
    return (
      <>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Caja {numeroCaja} · cerrada
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Para vender desde esta estación, abrila.</p>
          <button
            type="button"
            onClick={() => setModal("abrir")}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Abrir Caja {numeroCaja}
          </button>
        </div>
        {modal === "abrir" && (
          <AbrirCajaModal numeroCaja={numeroCaja} onClose={() => setModal(null)} onDone={after} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Caja {numeroCaja} · abierta
            </span>
          </div>
          <span className="text-[10px] text-slate-500">#{caja.numero_caja}</span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Apertura: <strong>{formatFechaHora(caja.fecha_apertura)}</strong>
        </p>
        <p className="text-xs text-slate-600">
          Inicial: <strong>{formatGs(caja.monto_apertura)}</strong>
        </p>

        {resumen && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <MiniStat label="Vendido" value={formatGs(resumen.total_vendido)} sub={`${resumen.cantidad_ventas} venta(s)`} />
            <MiniStat label="Efectivo" value={formatGs(resumen.total_efectivo)} />
            <MiniStat label="Transf." value={formatGs(resumen.total_transferencia)} />
            <MiniStat label="Tarjeta" value={formatGs(resumen.total_tarjeta)} />
            <div className="col-span-2 rounded-lg border border-emerald-300 bg-emerald-100/60 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Debería haber</p>
              <p className="text-sm font-bold tabular-nums text-emerald-900">{formatGs(resumen.efectivo_esperado)}</p>
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setModal("mov")}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Movimiento
          </button>
          <button
            type="button"
            onClick={() => setModal("cerrar")}
            className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            Cerrar
          </button>
        </div>
      </div>

      {modal === "cerrar" && resumen && (
        <CerrarCajaModal caja={caja} resumen={resumen} onClose={() => setModal(null)} onDone={after} />
      )}
      {modal === "mov" && (
        <MovimientoModal cajaId={caja.id} numeroCaja={caja.numero_caja} onClose={() => setModal(null)} onDone={after} />
      )}
    </>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xs font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────────

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 px-3 pt-12 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)">✕</button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
      ⚠ {msg}
    </div>
  );
}

// ── Abrir ────────────────────────────────────────────────────────────────────

function AbrirCajaModal({
  numeroCaja, onClose, onDone,
}: { numeroCaja: number; onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    setSaving(true);
    const r = await abrirCaja(numeroCaja, parseFloat(monto) || 0, obs.trim() || null);
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  return (
    <ModalShell title={`Abrir Caja ${numeroCaja}`} onClose={onClose}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Monto de apertura (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 300.000" className={inputClass} decimals={false} />
      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} placeholder="Ej: turno mañana" />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "Abriendo…" : "Abrir caja"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Cerrar ───────────────────────────────────────────────────────────────────

function CerrarCajaModal({
  caja, resumen, onClose, onDone,
}: { caja: Caja; resumen: CajaResumen; onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apertura = caja.monto_apertura;
  const transf = resumen.total_transferencia;
  const tarjeta = resumen.total_tarjeta;
  const ajustes = resumen.ajustes_efectivo;
  const efectivoEsperado = resumen.efectivo_esperado;
  const manualNet = resumen.ingresos_efectivo - resumen.egresos_efectivo - resumen.retiros_efectivo + ajustes;
  const cierreTotalEsperado = efectivoEsperado + transf + tarjeta;

  const contado = parseFloat(monto) || 0;
  const difEfectivo = contado - efectivoEsperado;
  const totalDeclarado = contado + transf + tarjeta;
  const difTotal = totalDeclarado - cierreTotalEsperado;

  async function submit() {
    setError(null);
    setSaving(true);
    const r = await cerrarCaja(contado, obs.trim() || null, caja.id);
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  return (
    <ModalShell title={`Cerrar Caja ${caja.numero_caja}`} onClose={onClose}>
      <SectionLabel>Resumen de ventas del turno</SectionLabel>
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <Row label="Cantidad de ventas" value={String(resumen.cantidad_ventas)} />
        <Row label="Ventas en efectivo" value={formatGs(resumen.total_efectivo)} />
        <Row label="Ventas por transferencia" value={formatGs(transf)} />
        <Row label="Ventas con tarjeta" value={formatGs(tarjeta)} />
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
          <span>Total vendido</span><span className="tabular-nums">{formatGs(resumen.total_vendido)}</span>
        </div>
      </div>

      <SectionLabel className="mt-4">Cierre total del turno</SectionLabel>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5">
        <div className="space-y-1.5 text-sm">
          <Row label="Monto de apertura" value={formatGs(apertura)} />
          <Row label="Total vendido" value={`+ ${formatGs(resumen.total_vendido)}`} />
          {manualNet !== 0 && (
            <Row label="Movimientos manuales de efectivo" value={`${manualNet > 0 ? "+" : "−"} ${formatGs(Math.abs(manualNet))}`} />
          )}
        </div>
        <div className="mt-2.5 flex items-baseline justify-between border-t border-sky-200 pt-2.5">
          <span className="text-sm font-semibold text-sky-900">Cierre total esperado</span>
          <span className="text-xl font-extrabold tabular-nums text-sky-900">{formatGs(cierreTotalEsperado)}</span>
        </div>
      </div>

      <SectionLabel className="mt-4">Desglose del cierre</SectionLabel>
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <Row label="Efectivo físico esperado" value={formatGs(efectivoEsperado)} />
        <Row label="Transferencias registradas" value={`+ ${formatGs(transf)}`} />
        <Row label="Tarjetas registradas" value={`+ ${formatGs(tarjeta)}`} />
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
          <span>Total cierre esperado</span><span className="tabular-nums">{formatGs(cierreTotalEsperado)}</span>
        </div>
      </div>

      <SectionLabel className="mt-4">Cierre</SectionLabel>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Efectivo físico contado en caja (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 160.000" className={inputClass} decimals={false} />

      {monto !== "" && (
        <div className="mt-3 space-y-2">
          <DiffRow label="Diferencia de efectivo físico" hint={`contado − esperado (${formatGs(efectivoEsperado)})`} value={difEfectivo} />
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span>Total declarado (efectivo + transferencias + tarjetas)</span>
            <span className="tabular-nums font-medium text-slate-700">{formatGs(totalDeclarado)}</span>
          </div>
          <DiffRow label="Diferencia total del turno" hint={`declarado − cierre total (${formatGs(cierreTotalEsperado)})`} value={difTotal} />
        </div>
      )}

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving || monto === ""} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          {saving ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</p>
  );
}

function DiffRow({ label, hint, value }: { label: string; hint: string; value: number }) {
  const tone = value === 0 ? "bg-emerald-50 text-emerald-700" : value > 0 ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-700";
  const signo = value > 0 ? "+ " : value < 0 ? "− " : "";
  const estado = value > 0 ? "(sobra)" : value < 0 ? "(falta)" : "(cuadra)";
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${tone}`}>
      <span>
        {label} <span className="font-normal opacity-70">{estado}</span>
        <span className="mt-0.5 block text-[10px] font-normal opacity-60">{hint}</span>
      </span>
      <span className="tabular-nums">{signo}{formatGs(Math.abs(value))}</span>
    </div>
  );
}

// ── Movimiento ───────────────────────────────────────────────────────────────

const TIPOS: { v: TipoMovimientoCaja; label: string }[] = [
  { v: "ingreso", label: "Ingreso" },
  { v: "egreso", label: "Egreso" },
  { v: "retiro", label: "Retiro" },
  { v: "ajuste", label: "Ajuste" },
];
const MEDIOS: { v: MedioPagoCaja; label: string }[] = [
  { v: "efectivo", label: "Efectivo" },
  { v: "tarjeta", label: "Tarjeta" },
  { v: "transferencia", label: "Transferencia" },
  { v: "otro", label: "Otro" },
];

function MovimientoModal({
  cajaId, numeroCaja, onClose, onDone,
}: { cajaId: string; numeroCaja: number; onClose: () => void; onDone: () => void }) {
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("ingreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<MedioPagoCaja>("efectivo");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (concepto.trim() === "") { setError("El concepto es obligatorio."); return; }
    if (!(parseFloat(monto) > 0)) { setError("El monto debe ser mayor a 0."); return; }
    setSaving(true);
    const r = await registrarMovimiento({
      tipo, concepto: concepto.trim(), monto: parseFloat(monto) || 0, medio_pago: medio, observacion: obs.trim() || null,
      caja_id: cajaId,
    });
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  return (
    <ModalShell title={`Movimiento · Caja ${numeroCaja}`} onClose={onClose}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
      <div className="grid grid-cols-4 gap-1">
        {TIPOS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTipo(t.v)}
            className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
              tipo === t.v ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>{t.label}</button>
        ))}
      </div>

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Concepto</label>
      <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputClass} placeholder="Ej: pago proveedor / retiro socio" />

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Monto (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 50.000" className={inputClass} decimals={false} />

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Medio de pago</label>
      <div className="grid grid-cols-4 gap-1">
        {MEDIOS.map((m) => (
          <button key={m.v} type="button" onClick={() => setMedio(m.v)}
            className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
              medio === m.v ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>{m.label}</button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Solo los movimientos en efectivo afectan el efectivo esperado.</p>

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:opacity-50">
          {saving ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </ModalShell>
  );
}
