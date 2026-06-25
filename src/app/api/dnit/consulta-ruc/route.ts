import { NextResponse } from "next/server";
import { consultarDnitRuc, parseRuc } from "@/lib/clientes/dnit-consulta-ruc";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";

/**
 * GET /api/dnit/consulta-ruc?ruc=80014066-1
 *
 * Devuelve la razón social asociada al RUC. Estrategia:
 *   1. Busca primero en clientes locales por `ruc` (acepta con o sin guion).
 *   2. Si no hay local y hay API key DNIT, consulta el servicio oficial.
 *   3. Si DNIT no responde / no está configurado, degrada limpio para carga manual.
 *
 * Nunca bloquea la facturación.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rucInput = (searchParams.get("ruc") ?? "").trim();
  if (!rucInput) {
    return NextResponse.json({ found: false, reason: "invalid_ruc", mensaje: "Falta el parámetro ruc." }, { status: 400 });
  }

  const parsed = parseRuc(rucInput);
  if (!parsed) {
    return NextResponse.json({
      found: false,
      reason: "invalid_ruc",
      mensaje: "Formato de RUC inválido. Usá dígitos opcionalmente con guion.",
    });
  }

  try {
    const user = await getAuthUserForApiRoute(request);
    if (user?.id) {
      const sb = createServiceRoleClient();
      const usuario = await resolveUsuarioErpFromAuthUser(sb, user);
      if (usuario?.empresa_id) {
        const orFilter = parsed.dv
          ? `ruc.eq.${parsed.ruc},ruc.eq.${parsed.rucCompleto}`
          : `ruc.eq.${parsed.ruc}`;
        const q = await sb
          .from("clientes")
          .select("id, nombre_contacto, empresa, ruc, telefono, email")
          .eq("empresa_id", usuario.empresa_id)
          .or(orFilter)
          .limit(1)
          .maybeSingle();
        if (!q.error && q.data) {
          return NextResponse.json({
            found: true,
            ruc: parsed.ruc,
            dv: parsed.dv,
            ruc_completo: parsed.rucCompleto,
            razon_social: (q.data.empresa as string) || (q.data.nombre_contacto as string) || "",
            nombre_comercial: (q.data.empresa as string) || null,
            estado: null,
            fuente: "local",
            cliente: { id: q.data.id, ruc: q.data.ruc, empresa: q.data.empresa, nombre_contacto: q.data.nombre_contacto, telefono: q.data.telefono, email: q.data.email },
          });
        }
      }
    }
  } catch {
    /* fallthrough a DNIT */
  }

  const dnit = await consultarDnitRuc(rucInput);
  return NextResponse.json(dnit);
}
