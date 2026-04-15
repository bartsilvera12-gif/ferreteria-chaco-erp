"use client";

import { Suspense } from "react";
import { CanalesHubInner } from "./CanalesHubInner";

export default function ConfiguracionCanalesHubPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24 text-sm text-slate-400">Cargando…</div>}>
      <CanalesHubInner />
    </Suspense>
  );
}
