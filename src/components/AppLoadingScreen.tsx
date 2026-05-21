/**
 * Pantalla de carga global — En lo de Mari.
 * Fondo teal con gradiente sutil + logo Zentra (Z) blanco + texto "C A R G A N D O ..."
 * con dots animados. Solo presentación: no toca lógica de auth/datos.
 */
export default function AppLoadingScreen({ label = "CARGANDO" }: { label?: string }) {
  return (
    <div className="app-loading-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center">
      <div className="app-loading-z flex h-24 w-24 items-center justify-center rounded-2xl border border-white/15 shadow-2xl backdrop-blur-sm">
        <span className="text-5xl font-extrabold leading-none tracking-tight text-white">Z</span>
      </div>
      <p className="mt-8 text-sm font-semibold text-white/90" style={{ letterSpacing: "0.4em" }}>
        {label.split("").join(" ")}
        <span className="app-loading-dots" aria-hidden>...</span>
      </p>
    </div>
  );
}
