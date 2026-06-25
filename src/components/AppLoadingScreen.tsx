"use client";

import { useEffect, useState } from "react";

/**
 * Pantalla de carga global — En lo de Mari.
 * Fondo teal con gradiente + logo Z animado (las dos mitades se separan y
 * vuelven a su sitio) + texto "Z E N T R A".
 *
 * Maneja su propia animación de salida con fade-out + min-duration para
 * cubrir el lag entre que termina la auth y el sidebar/dashboard renderiza.
 */
export default function AppLoadingScreen({
  active = true,
  minDurationMs = 1200,
  fadeOutMs = 400,
}: {
  /** Mientras true, el overlay se mantiene visible. Al volverse false, espera el resto del minDuration y hace fade-out. */
  active?: boolean;
  minDurationMs?: number;
  fadeOutMs?: number;
}) {
  const [mounted, setMounted] = useState(true);
  const [visible, setVisible] = useState(true);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    if (active) {
      setVisible(true);
      setMounted(true);
      return;
    }
    const elapsed = Date.now() - mountedAt;
    const remaining = Math.max(0, minDurationMs - elapsed);
    const hideTimer = setTimeout(() => setVisible(false), remaining);
    const unmountTimer = setTimeout(() => setMounted(false), remaining + fadeOutMs);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(unmountTimer);
    };
  }, [active, mountedAt, minDurationMs, fadeOutMs]);

  if (!mounted) return null;

  return (
    <div
      className="app-loading-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeOutMs}ms ease-out`,
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-hidden={!visible}
    >
      <p
        className="text-xs font-semibold text-white/85"
        style={{ letterSpacing: "0.5em" }}
      >
        C A R G A N D O
        <span className="app-loading-dots" aria-hidden>...</span>
      </p>
    </div>
  );
}
