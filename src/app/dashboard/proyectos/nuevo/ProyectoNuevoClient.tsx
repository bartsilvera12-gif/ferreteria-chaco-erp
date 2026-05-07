"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ClienteSearchSelect } from "@/app/dashboard/proyectos/components/ClienteSearchSelect";

type Tipo = { id: string; nombre: string; codigo: string };
type Estado = { id: string; nombre: string };
type Cliente = { id: string; empresa?: string | null; nombre_contacto?: string | null };
type Usuario = { id: string; nombre?: string | null };

/** Campos del brief web guardados en `brief_data` (JSON). Sin checkbox de logo ni dominio existente (compat.: datos viejos siguen en JSON al editar desde detalle). */
type BriefFieldDef =
  | { kind: "checkbox"; key: string; label: string }
  | { kind: "text"; key: string; label: string; placeholder?: string };

const WEB_BRIEF_FIELDS: BriefFieldDef[] = [
  { kind: "text", key: "marca", label: "Nombre de la marca" },
  { kind: "text", key: "rubro", label: "Rubro" },
  { kind: "text", key: "objetivo", label: "Objetivo de la web" },
  { kind: "text", key: "tipo_web", label: "Tipo de web (institucional, ecommerce, etc.)" },
  { kind: "text", key: "secciones", label: "Secciones necesarias" },
  { kind: "text", key: "estilo_colores", label: "Colores o estilo deseado" },
  { kind: "text", key: "logo_cliente", label: "Logo del cliente", placeholder: "https://..." },
  { kind: "text", key: "redes_sociales", label: "Redes sociales" },
  { kind: "text", key: "whatsapp_contacto", label: "WhatsApp de contacto" },
  { kind: "text", key: "dominio_usar", label: "Dominio a usar" },
  { kind: "checkbox", key: "hosting_existente", label: "Hosting existente" },
  { kind: "text", key: "referencias_urls", label: "Referencias de páginas" },
];

export default function ProyectoNuevoClient() {
  const router = useRouter();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tipoId, setTipoId] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const [rc, setRc] = useState("");
  const [rt, setRt] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaProm, setFechaProm] = useState("");
  const [monto, setMonto] = useState("");
  const [brief, setBrief] = useState<Record<string, string>>({});

  const tipoCodigo = useMemo(() => tipos.find((t) => t.id === tipoId)?.codigo ?? "", [tipos, tipoId]);
  const esWeb = tipoCodigo === "web";

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [rT, rE, rC, rU] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/empresas/usuarios", { cache: "no-store" }),
      ]);
      const jT = (await rT.json()) as { success?: boolean; data?: Tipo[] };
      const jE = (await rE.json()) as { success?: boolean; data?: Estado[] };
      const jC = (await rC.json()) as { success?: boolean; data?: Cliente[] };
      const jUsers = (await rU.json()) as { usuarios?: Usuario[] };
      if (cancel) return;
      if (jT.success && jT.data) {
        setTipos(jT.data);
        const web = jT.data.find((t) => t.codigo === "web");
        if (web) setTipoId(web.id);
      }
      if (jE.success && jE.data) setEstados(jE.data);
      if (jC.success && jC.data) setClientes(jC.data);
      setUsuarios(jUsers.usuarios ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const brief_data =
      esWeb
        ? Object.fromEntries(
            WEB_BRIEF_FIELDS.map(({ key }) => [key, brief[key] ?? ""]).filter(([, v]) => v !== "")
          )
        : {};

    const body: Record<string, unknown> = {
      tipo_id: tipoId,
      titulo,
      descripcion: descripcion || null,
      prioridad,
      cliente_id: clienteId || null,
      responsable_comercial_id: rc || null,
      responsable_tecnico_id: rt || null,
      fecha_ingreso: new Date(fechaIngreso + "T12:00:00").toISOString(),
      fecha_prometida: fechaProm ? new Date(fechaProm + "T12:00:00").toISOString() : null,
      monto_vendido: monto.trim() === "" ? null : Number(monto),
      brief_data,
    };
    if (estadoId) body.estado_id = estadoId;

    const res = await fetchWithSupabaseSession("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { success?: boolean; data?: { id?: string }; error?: string };
    setSaving(false);
    if (!res.ok || !j.success || !j.data?.id) {
      setErr(j.error ?? "No se pudo crear");
      return;
    }
    router.push(`/dashboard/proyectos/${j.data.id}`);
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Cargando…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/proyectos" className="text-sm text-indigo-600 hover:underline">
          ← Volver
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Nuevo proyecto</h1>

      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

      <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Título</span>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tipo</span>
            <select
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <ClienteSearchSelect clientes={clientes} value={clienteId} onChange={setClienteId} />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Estado inicial (opcional)</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={estadoId}
              onChange={(e) => setEstadoId(e.target.value)}
            >
              <option value="">Predeterminado de empresa</option>
              {estados.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Prioridad</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}
            >
              <option value="baja">Baja</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Resp. comercial</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={rc}
              onChange={(e) => setRc(e.target.value)}
            >
              <option value="">—</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre ?? u.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Resp. técnico</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={rt}
              onChange={(e) => setRt(e.target.value)}
            >
              <option value="">—</option>
              {usuarios.map((u) => (
                <option key={`t-${u.id}`} value={u.id}>
                  {u.nombre ?? u.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fecha ingreso</span>
            <input
              type="date"
              required
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fecha prometida</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={fechaProm}
              onChange={(e) => setFechaProm(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Monto vendido</span>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Descripción breve</span>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>

        {esWeb ? (
          <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
            <h2 className="text-sm font-semibold text-indigo-900">Brief web</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {WEB_BRIEF_FIELDS.map((f) =>
                f.kind === "checkbox" ? (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={brief[f.key] === "1"}
                      onChange={(e) =>
                        setBrief((b) => ({ ...b, [f.key]: e.target.checked ? "1" : "" }))
                      }
                    />
                    {f.label}
                  </label>
                ) : (
                  <label key={f.key} className="block text-sm sm:col-span-2">
                    <span className="text-slate-700">{f.label}</span>
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder={f.placeholder}
                      value={brief[f.key] ?? ""}
                      onChange={(e) => setBrief((b) => ({ ...b, [f.key]: e.target.value }))}
                    />
                  </label>
                )
              )}
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Crear proyecto"}
        </button>
      </form>
    </div>
  );
}
