"use client";

import Link from "next/link";
import { ClipboardList, Hash, Landmark, Percent } from "lucide-react";
import {
  ConfigFormCard,
  ConfigHelpText,
  ConfigMetricCard,
  ConfigSectionTitle,
  F_INPUT,
  F_LABEL,
} from "@/components/config/global-config-primitives";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import { useGlobalConfigForm } from "@/lib/config/use-global-config-form";

export default function ConfiguracionFacturacionPage() {
  const { config, form, handleChange, handleGuardar, success, ready } = useGlobalConfigForm();

  if (!ready || !config || !form) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">
        Cargando configuración…
      </div>
    );
  }

  const facturaPreview = `${form.prefijo_factura}${String(form.numeracion_inicial).padStart(6, "0")}`;

  return (
    <GlobalConfigSubpageShell
      title="Facturación"
      description="Numeración, condiciones de cobro y enlace a SIFEN / facturación electrónica."
    >
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Configuración guardada correctamente.
        </div>
      )}

      <div className="space-y-5">
        <ConfigFormCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                <Landmark className="h-5 w-5 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  SIFEN / Facturación electrónica
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Timbrado, CSC, certificado .p12 y ambiente SET. Opcional: las empresas sin SIFEN no se ven afectadas.
                </p>
              </div>
            </div>
            <Link
              href="/configuracion/facturacion-electronica"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#0EA5E9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0284C7]"
            >
              Configurar SIFEN
            </Link>
          </div>
        </ConfigFormCard>

        <ConfigFormCard>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 sm:mt-0.5">
              <Hash className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <ConfigSectionTitle>Numeración de documentos</ConfigSectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={F_LABEL}>Prefijo de factura</label>
                  <input
                    type="text"
                    name="prefijo_factura"
                    value={form.prefijo_factura}
                    onChange={handleChange}
                    placeholder="FAC-"
                    className={F_INPUT}
                  />
                  <ConfigHelpText>Prefijo que antecede al número correlativo (ej: FAC-, FT-, VTA-).</ConfigHelpText>
                </div>
                <div>
                  <label className={F_LABEL}>Numeración inicial</label>
                  <input
                    type="number"
                    name="numeracion_inicial"
                    value={form.numeracion_inicial}
                    onChange={handleChange}
                    min={1}
                    step={1}
                    className={F_INPUT}
                  />
                  <ConfigHelpText>Número desde el cual comienza la secuencia de facturas.</ConfigHelpText>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs text-slate-500">Vista previa:</span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-mono text-sm font-bold text-slate-800">
                  {facturaPreview}
                </span>
                <span className="text-xs text-slate-400">→</span>
                <span className="font-mono text-xs text-slate-500">
                  {form.prefijo_factura}
                  {String(form.numeracion_inicial + 1).padStart(6, "0")}
                </span>
              </div>
            </div>
          </div>
        </ConfigFormCard>

        <ConfigFormCard>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 sm:mt-0.5">
              <Percent className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <ConfigSectionTitle>Condiciones de pago</ConfigSectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={F_LABEL}>Días de vencimiento por defecto</label>
                  <div className="relative">
                    <input
                      type="number"
                      name="dias_vencimiento_default"
                      value={form.dias_vencimiento_default}
                      onChange={handleChange}
                      min={0}
                      max={365}
                      step={1}
                      className={F_INPUT}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      días
                    </span>
                  </div>
                  <ConfigHelpText>Plazo aplicado automáticamente a facturas a crédito sin plazo definido.</ConfigHelpText>
                </div>
                <div>
                  <label className={F_LABEL}>Interés moratorio</label>
                  <div className="relative">
                    <input
                      type="number"
                      name="interes_moratorio"
                      value={form.interes_moratorio}
                      onChange={handleChange}
                      min={0}
                      max={100}
                      step={0.1}
                      className={F_INPUT}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      % mens.
                    </span>
                  </div>
                  <ConfigHelpText>Porcentaje mensual aplicado sobre el saldo vencido impago.</ConfigHelpText>
                </div>
              </div>
            </div>
          </div>
        </ConfigFormCard>

        <ConfigFormCard>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 sm:mt-0.5">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <ConfigSectionTitle>Resumen actual</ConfigSectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ConfigMetricCard label="Prefijo" value={config.prefijo_factura} />
                <ConfigMetricCard label="Nro. inicial" value={config.numeracion_inicial} />
                <ConfigMetricCard label="Vencimiento" value={`${config.dias_vencimiento_default} días`} />
                <ConfigMetricCard label="Interés mora" value={`${config.interes_moratorio}% mens.`} />
              </div>
            </div>
          </div>
        </ConfigFormCard>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleGuardar}
            className="rounded-lg bg-[#0EA5E9] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0284C7] active:scale-95"
          >
            Guardar configuración
          </button>
          <p className="text-xs text-slate-400">Los cambios se aplican de inmediato en todo el sistema.</p>
        </div>
      </div>
    </GlobalConfigSubpageShell>
  );
}
