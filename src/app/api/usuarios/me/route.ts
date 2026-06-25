import { NextResponse } from "next/server";
import { getServiceAuthUsuario } from "@/lib/auth/get-service-auth-usuario";

type UsuarioMeRow = {
  nombre: string | null;
  email: string | null;
  rol: string | null;
  numero_caja_asignada: number | null;
};

function pickAuthMetadataName(authUser: { user_metadata?: Record<string, unknown> | null }): string | null {
  const meta = authUser.user_metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.nombre];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * GET /api/usuarios/me
 *
 * Perfil mínimo para el header: resuelve el usuario autenticado server-side y
 * evita leer `usuarios` desde el navegador.
 */
export async function GET(request: Request) {
  try {
    const r = await getServiceAuthUsuario(request);
    if (!r.ok) {
      return NextResponse.json({ error: "No autenticado" }, { status: r.status });
    }

    const { authUser, catalogUsuario, supabaseSr } = r;
    let row: UsuarioMeRow | null = null;

    if (catalogUsuario?.id) {
      // Intento primario con la columna nueva. Si PostgREST no la conoce todavía
      // (schema cache desactualizado), reintentamos sin ella para que el endpoint
      // siga sirviendo nombre/email/rol — la asignación de caja quedará null.
      let { data, error } = await supabaseSr
        .from("usuarios")
        .select("nombre, email, rol, numero_caja_asignada")
        .eq("id", catalogUsuario.id)
        .maybeSingle();
      if (error && /column|numero_caja_asignada/i.test(error.message)) {
        const retry = await supabaseSr
          .from("usuarios")
          .select("nombre, email, rol")
          .eq("id", catalogUsuario.id)
          .maybeSingle();
        data = retry.data as typeof data;
        error = retry.error;
      }
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      row = (data ?? null) as UsuarioMeRow | null;
    }

    const nombre = (row?.nombre ?? pickAuthMetadataName(authUser) ?? "").trim() || null;
    const email = (row?.email ?? authUser.email ?? "").trim() || null;
    const rol = (row?.rol ?? catalogUsuario?.rol ?? "").trim() || null;
    const ncaRaw = row?.numero_caja_asignada;
    const numero_caja_asignada =
      ncaRaw != null && Number.isInteger(Number(ncaRaw)) && Number(ncaRaw) >= 1 && Number(ncaRaw) <= 3
        ? Number(ncaRaw)
        : null;

    return NextResponse.json({ usuario: { nombre, rol, email, numero_caja_asignada } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el usuario actual";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
