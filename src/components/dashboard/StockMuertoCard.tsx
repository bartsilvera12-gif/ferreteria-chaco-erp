"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Archive, ArrowRight } from "lucide-react";

function fmtGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

/**
 * Card resumen del reporte "Productos sin movimiento" (stock muerto).
 * Pensada para el dashboard de Inventario en el rubro autopartes:
 * destaca capital inmovilizado en productos que no rotan.
 *
 * Auto-fetch silencioso al endpoint /api/reportes/sin-movimiento?dias=90.
 * Si la consulta falla o no hay datos, la card no se muestra (no rompe
 * el layout del dashboard).
 */
export default function StockMuertoCard({ dias = 90 }: { dias?: number }) {
  const [count, setCount] = useState<number | null>(null);
  const [valor, setValor] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/reportes/sin-movimiento?dias=${dias}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setCount(Number(j.data?.count ?? 0));
        setValor(Number(j.data?.valor_total_inmovilizado ?? 0));
      })
      .catch(() => { /* silencioso — el card simplemente no aparece */ })
      .finally(() => { if (!cancel) setLoaded(true); });
    return () => { cancel = true; };
  }, [dias]);

  if (!loaded) return null;
  if (count === null || count === 0) return null;

  return (
    <Link href="/reportes/sin-movimiento" className="block">
      <motion.div
        whileHover={{ y: -2 }}
        className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2">
              <Archive className="h-5 w-5 text-amber-700" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Stock muerto · últ. {dias} días
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700/60" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums text-[#4FAEB2]">{count}</p>
            <p className="mt-0.5 text-xs text-slate-500">productos sin venta</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-amber-800">{fmtGs(valor)}</p>
            <p className="mt-0.5 text-xs text-slate-500">capital inmovilizado</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
