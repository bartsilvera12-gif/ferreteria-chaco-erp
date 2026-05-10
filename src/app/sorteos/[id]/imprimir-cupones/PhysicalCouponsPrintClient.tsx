"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type {
  EntradaImpresionContext,
  PhysicalCouponPrintRow,
} from "@/lib/sorteos/physical-coupons-print";
import type { SorteoEntradaEstadoPago } from "@/lib/sorteos/types";

const COLS = 2;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;

const ESTADOS: { value: SorteoEntradaEstadoPago; label: string }[] = [
  { value: "confirmado", label: "Confirmado" },
  { value: "pendiente_revision", label: "Pendiente de revisión" },
  { value: "pendiente", label: "Pendiente" },
  { value: "rechazado", label: "Rechazado" },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PhysicalCouponsPrintClient({
  sorteoId,
  sorteoNombre,
  rows,
  error,
  q,
  estado,
  fechaDesde,
  fechaHasta,
  entradaId,
  entradaContext,
}: {
  sorteoId: string;
  sorteoNombre: string;
  rows: PhysicalCouponPrintRow[];
  error: string | null;
  q: string;
  estado: SorteoEntradaEstadoPago;
  fechaDesde: string;
  fechaHasta: string;
  entradaId: string | null;
  entradaContext: EntradaImpresionContext | null;
}) {
  const router = useRouter();
  const pages = chunk(rows, PER_PAGE);

  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [confirmOk, setConfirmOk] = useState(false);

  const modoEntrada = Boolean(entradaId && entradaContext);
  const yaImpreso = Boolean(entradaContext?.cupones_impresos_at);
  const mostrarConfirmar = modoEntrada && Boolean(entradaId) && !yaImpreso && !confirmOk;

  function handlePrint() {
    window.print();
  }

  async function handleConfirmarImpresion() {
    if (!entradaId) return;
    setConfirmPending(true);
    setConfirmErr(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/sorteos/entradas/${encodeURIComponent(entradaId)}/confirmar-impresion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sorteo_id: sorteoId }),
        }
      );
      const raw = await res.text();
      if (!res.ok) {
        setConfirmErr(raw || `Error ${res.status}`);
        return;
      }
      setConfirmOk(true);
      router.refresh();
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "Error al confirmar");
    } finally {
      setConfirmPending(false);
    }
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          .print-page-break { break-after: page; page-break-after: always; }
          .print-page-break:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="space-y-6 max-w-5xl">
        <div className="no-print flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/sorteos" className="hover:text-slate-800">
            Sorteos
          </Link>
          <span>/</span>
          <Link href={`/sorteos/${encodeURIComponent(sorteoId)}/editar`} className="hover:text-slate-800">
            Editar sorteo
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-800">Imprimir cupones</span>
        </div>

        <div className="no-print space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Imprimir cupones para urna</h1>
          <p className="text-slate-600 text-sm">
            Se imprimirá un cupón físico por cada cupón confirmado del sorteo.
          </p>
          {!modoEntrada ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Solo se incluyen cupones de compras confirmadas, salvo que cambies el filtro de estado de pago.
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            Fecha en el cupón: se usa la fecha de pago si existe; si no, la fecha de creación de la orden.
          </p>
        </div>

        {modoEntrada && entradaContext ? (
          <div className="no-print rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <p className="font-semibold">
              Imprimiendo cupones de la orden N°{" "}
              <span className="tabular-nums">{entradaContext.numero_orden}</span>
            </p>
            <p>
              Cliente: <strong>{entradaContext.nombre_participante || "—"}</strong>
            </p>
            <p>
              Cantidad de cupones:{" "}
              <strong className="tabular-nums">{entradaContext.cantidad_cupones}</strong>
            </p>
            {yaImpreso ? (
              <p className="mt-2 text-xs text-emerald-900">
                Impresión ya registrada{" "}
                {entradaContext.cupones_impresos_at
                  ? new Date(entradaContext.cupones_impresos_at).toLocaleString("es-PY")
                  : ""}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        {confirmOk ? (
          <div className="no-print rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Impresión confirmada correctamente.
          </div>
        ) : null}

        {confirmErr ? (
          <div className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {confirmErr}
          </div>
        ) : null}

        {!modoEntrada ? (
          <form
            method="get"
            className="no-print flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Buscar
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Nombre, doc., teléfono u orden"
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm min-w-[200px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Estado de pago
              <select
                name="estado"
                defaultValue={estado}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                {ESTADOS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Desde
              <input
                name="fecha_desde"
                type="date"
                defaultValue={fechaDesde}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Hasta
              <input
                name="fecha_hasta"
                type="date"
                defaultValue={fechaHasta}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Aplicar filtros
            </button>
          </form>
        ) : (
          <div className="no-print flex flex-wrap gap-2">
            <Link
              href={`/sorteos/${encodeURIComponent(sorteoId)}/imprimir-cupones`}
              className="text-sm font-medium text-[#0EA5E9] hover:underline"
            >
              Ver todos los cupones del sorteo (sin filtrar por orden)
            </Link>
          </div>
        )}

        <div className="no-print flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-slate-800">
            Cupones listos para imprimir: <span className="tabular-nums">{rows.length}</span>
          </p>
          {sorteoNombre ? (
            <span className="text-sm text-slate-500">
              Sorteo: <strong className="font-semibold text-slate-700">{sorteoNombre}</strong>
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="rounded-lg bg-[#0EA5E9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 disabled:pointer-events-none"
          >
            Imprimir cupones
          </button>

          {mostrarConfirmar ? (
            <button
              type="button"
              onClick={() => void handleConfirmarImpresion()}
              disabled={confirmPending || rows.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirmPending ? "Confirmando…" : "Confirmar impresión"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => router.push(`/sorteos/${encodeURIComponent(sorteoId)}/editar`)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Volver al sorteo
          </button>
          <button
            type="button"
            onClick={() => router.push("/sorteos/cupones")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Volver a Cupones
          </button>
        </div>

        <div className="print-area rounded-xl border border-slate-200 bg-white p-4 print:border-0 print:p-0">
          {rows.length === 0 && !error ? (
            <p className="no-print text-sm text-slate-500">No hay cupones con los filtros seleccionados.</p>
          ) : null}

          {pages.map((pageRows, pi) => (
            <div
              key={pi}
              className={`print-page-break mx-auto max-w-[190mm] ${pi > 0 ? "mt-8 print:mt-0" : ""}`}
            >
              <div
                className="grid gap-3 print:gap-2"
                style={{
                  gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                  gridAutoRows: "minmax(28mm, auto)",
                }}
              >
                {pageRows.map((row) => (
                  <article
                    key={row.cupon_id}
                    className="flex flex-col justify-between rounded-lg border border-dashed border-slate-400 bg-slate-50/80 p-3 text-center shadow-sm print:bg-white print:shadow-none break-inside-avoid page-break-inside-avoid"
                  >
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {row.sorteo_nombre}
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-slate-900">{row.numero_cupon}</p>
                      <p className="text-xs text-slate-600">
                        Orden <span className="font-semibold tabular-nums">{row.numero_orden}</span>
                      </p>
                    </div>
                    <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-[11px] text-slate-700">
                      {row.nombre_participante ? (
                        <p className="truncate" title={row.nombre_participante}>
                          {row.nombre_participante}
                        </p>
                      ) : (
                        <p className="text-slate-400">—</p>
                      )}
                      {row.documento_masked ? <p>Doc. {row.documento_masked}</p> : null}
                      {row.whatsapp_masked ? <p>Tel. {row.whatsapp_masked}</p> : null}
                      <p className="text-slate-500">{row.fecha_display}</p>
                    </div>
                  </article>
                ))}
                {Array.from({ length: Math.max(0, PER_PAGE - pageRows.length) }).map((_, i) => (
                  <div
                    key={`pad-${pi}-${i}`}
                    className="rounded-lg border border-transparent print:hidden"
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
