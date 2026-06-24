import { NextResponse } from "next/server";
import { consultarRucPublico } from "@/lib/clientes/consulta-ruc";

/**
 * GET /api/clientes/consulta-ruc?ruc=80014066
 * Devuelve el nombre/razón social asociado al RUC consultando fuentes públicas.
 * Si no se encuentra (o ningún proveedor respondió), devuelve `{ found: false }`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ruc = (searchParams.get("ruc") ?? "").trim();
  if (!ruc) {
    return NextResponse.json({ error: "Falta el parámetro ruc" }, { status: 400 });
  }
  const result = await consultarRucPublico(ruc);
  return NextResponse.json(result);
}
