"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import {
  getUsuario, updateUsuario, toggleEstadoUsuario, deleteUsuario, emailExiste,
} from "@/lib/usuarios/storage";
import type { AreaUsuario, NivelUsuario, TipoContrato, Usuario } from "@/lib/usuarios/types";

// ── Helpers UI ────────────────────────────────────────────────────────────────

const fLabel  = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const fInput  = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 bg-white disabled:bg-gray-50 disabled:text-gray-500";
const fSelect = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 bg-white disabled:bg-gray-50";

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5 pb-2 border-b border-gray-100">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

const NIVEL_LABEL: Record<NivelUsuario, string>    = { usuario: "Usuario", supervisor: "Supervisor", administrador: "Administrador" };
const AREA_LABEL:  Record<AreaUsuario,  string>    = { ventas: "Ventas", soporte: "Soporte", finanzas: "Finanzas", operaciones: "Operaciones", administracion: "Administración" };
const CONTRATO_LABEL: Record<TipoContrato, string> = { salario: "Salario fijo", comision: "Comisión", mixto: "Mixto", prestador_servicio: "Prestador de servicio" };

const AVATAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-sky-500"];
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }
function getInitials(nombre: string) { return nombre.split(" ").slice(0,2).map((w)=>w[0]).join("").toUpperCase(); }

function formatFecha(s?: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function formatGs(n?: number) {
  if (!n) return "—";
  return `Gs. ${n.toLocaleString("es-PY")}`;
}

// ── Contenido principal ───────────────────────────────────────────────────────

function UsuarioDetailContent() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  if (!params) return null;
  const id           = parseInt(params.id as string, 10);
  const editMode     = searchParams?.get("edit") === "1";

  const [usuario,   setUsuario]   = useState<Usuario | null>(null);
  const [editing,   setEditing]   = useState(editMode);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDel,   setShowDel]   = useState(false);
  const [showPwd,   setShowPwd]   = useState(false);

  const [form, setForm] = useState({
    nombre:              "",
    email:               "",
    telefono:            "",
    fecha_nacimiento:    "",
    fecha_ingreso:       "",
    tipo_contrato:       "salario" as TipoContrato,
    salario_base:        "",
    porcentaje_comision: "",
    ips:                 false,
    nivel:               "usuario" as NivelUsuario,
    area:                "ventas"  as AreaUsuario,
    estado:              "activo"  as "activo" | "inactivo",
    password:            "",
  });

  useEffect(() => {
    const u = getUsuario(id);
    if (!u) { router.push("/usuarios"); return; }
    setUsuario(u);
    setForm({
      nombre:              u.nombre,
      email:               u.email,
      telefono:            u.telefono ?? "",
      fecha_nacimiento:    u.fecha_nacimiento ?? "",
      fecha_ingreso:       u.fecha_ingreso    ?? "",
      tipo_contrato:       u.tipo_contrato    ?? "salario",
      salario_base:        u.salario_base        != null ? String(u.salario_base)        : "",
      porcentaje_comision: u.porcentaje_comision != null ? String(u.porcentaje_comision) : "",
      ips:                 u.ips,
      nivel:               u.nivel,
      area:                u.area,
      estado:              u.estado,
      password:            "",
    });
  }, [id, router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const upper = ["nombre"];
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      let normalized = value;
      if (name === "email" || type === "email") normalized = value.toLowerCase();
      else if (upper.includes(name)) normalized = value.toUpperCase();
      setForm((prev) => ({ ...prev, [name]: normalized }));
    }
  }

  function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (!form.email.trim())  { setFormError("El email es obligatorio.");  return; }
    if (emailExiste(form.email, id)) { setFormError("Ese email ya lo usa otro usuario."); return; }
    if (form.password && form.password.length < 6) { setFormError("La contraseña debe tener al menos 6 caracteres."); return; }

    updateUsuario(id, {
      nombre:              form.nombre.trim(),
      email:               form.email.trim().toLowerCase(),
      telefono:            form.telefono.trim() || undefined,
      fecha_nacimiento:    form.fecha_nacimiento || undefined,
      fecha_ingreso:       form.fecha_ingreso    || undefined,
      tipo_contrato:       form.tipo_contrato,
      salario_base:        form.salario_base        ? parseFloat(form.salario_base)        : undefined,
      porcentaje_comision: form.porcentaje_comision ? parseFloat(form.porcentaje_comision) : undefined,
      ips:                 form.ips,
      nivel:               form.nivel,
      area:                form.area,
      estado:              form.estado,
      ...(form.password ? { password_hash: form.password } : {}),
    });

    router.push("/usuarios");
  }

  function handleToggleEstado() {
    if (!usuario) return;
    toggleEstadoUsuario(id, usuario.estado === "activo" ? "inactivo" : "activo");
    router.push("/usuarios");
  }

  function handleEliminar() {
    deleteUsuario(id);
    router.push("/usuarios");
  }

  if (!usuario) {
    return <div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando…</div>;
  }

  const showComision = form.tipo_contrato === "comision" || form.tipo_contrato === "mixto";
  const showSalario  = form.tipo_contrato !== "comision";

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/usuarios" className="hover:text-gray-700 transition-colors">Usuarios</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{usuario.codigo_usuario}</span>
      </div>

      {/* Header del usuario */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 ${avatarColor(usuario.id)}`}>
            {getInitials(usuario.nombre)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{usuario.nombre}</h1>
              <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{usuario.codigo_usuario}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                usuario.estado === "activo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}>{usuario.estado}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{usuario.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                {NIVEL_LABEL[usuario.nivel]}
              </span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {AREA_LABEL[usuario.area]}
              </span>
              {usuario.ips && (
                <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded">IPS</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <button type="button" onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
              </svg>
              Editar
            </button>
          )}
          <button type="button" onClick={handleToggleEstado}
            className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
              usuario.estado === "activo"
                ? "border-red-200 text-red-600 hover:bg-red-50"
                : "border-green-200 text-green-600 hover:bg-green-50"
            }`}>
            {usuario.estado === "activo" ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>

      {/* ── Vista de solo lectura ──────────────────────────────────── */}
      {!editing && (
        <div className="space-y-6">

          <SectionCard title="Datos personales" icon="👤">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Nombre",           value: usuario.nombre },
                { label: "Email",            value: usuario.email },
                { label: "Teléfono",         value: usuario.telefono ?? "—" },
                { label: "Fecha nacimiento", value: formatFecha(usuario.fecha_nacimiento) },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className="font-medium text-gray-800">{i.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Datos laborales" icon="💼">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Fecha de ingreso", value: formatFecha(usuario.fecha_ingreso) },
                { label: "Tipo de contrato", value: usuario.tipo_contrato ? CONTRATO_LABEL[usuario.tipo_contrato] : "—" },
                { label: "Salario base",     value: formatGs(usuario.salario_base) },
                { label: "Comisión",         value: usuario.porcentaje_comision != null ? `${usuario.porcentaje_comision}%` : "—" },
                { label: "IPS",              value: usuario.ips ? "Sí cotiza" : "No cotiza" },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className={`font-medium ${i.label === "IPS" && usuario.ips ? "text-green-700" : "text-gray-800"}`}>
                    {i.value}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Accesos del sistema" icon="🔐">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: "Nivel",  value: NIVEL_LABEL[usuario.nivel] },
                { label: "Área",   value: AREA_LABEL[usuario.area]   },
                { label: "Estado", value: usuario.estado             },
                { label: "Registrado", value: new Date(usuario.created_at).toLocaleDateString("es-PY") },
              ].map((i) => (
                <div key={i.label}>
                  <p className="text-xs text-gray-400">{i.label}</p>
                  <p className="font-medium text-gray-800 capitalize">{i.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

        </div>
      )}

      {/* ── Formulario de edición ──────────────────────────────────── */}
      {editing && (
        <form onSubmit={handleGuardar} className="space-y-6">

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{formError}</div>
          )}

          {/* 1. Datos personales */}
          <SectionCard title="Datos personales" icon="👤">
            <div className="space-y-4">
              <div>
                <label className={fLabel}>Nombre completo *</label>
                <input type="text" name="nombre" value={form.nombre} onChange={handleChange}
                  className={`${fInput} uppercase`} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fLabel}>Email *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} className={fInput} required />
                </div>
                <div>
                  <label className={fLabel}>Teléfono</label>
                  <input type="text" name="telefono" value={form.telefono} onChange={handleChange} className={fInput} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fLabel}>Fecha de nacimiento</label>
                  <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} className={fInput} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 2. Datos laborales */}
          <SectionCard title="Datos laborales" icon="💼">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fLabel}>Fecha de ingreso</label>
                  <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={handleChange} className={fInput} />
                </div>
                <div>
                  <label className={fLabel}>Tipo de contrato</label>
                  <select name="tipo_contrato" value={form.tipo_contrato} onChange={handleChange} className={fSelect}>
                    <option value="salario">Salario fijo</option>
                    <option value="comision">Comisión</option>
                    <option value="mixto">Mixto (salario + comisión)</option>
                    <option value="prestador_servicio">Prestador de servicio</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {showSalario && (
                  <div>
                    <label className={fLabel}>Salario base (Gs.)</label>
                    <MontoInput
                      value={form.salario_base}
                      onChange={(n) => setForm((prev) => ({ ...prev, salario_base: String(n) }))}
                      placeholder="0"
                      className={fInput}
                      decimals={false}
                    />
                  </div>
                )}
                {showComision && (
                  <div>
                    <label className={fLabel}>Comisión (%)</label>
                    <input type="number" name="porcentaje_comision" value={form.porcentaje_comision}
                      onChange={handleChange} min={0} max={100} step="0.5" placeholder="0" className={fInput} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="ips_edit" name="ips" checked={form.ips} onChange={handleChange}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20" />
                <label htmlFor="ips_edit" className="text-sm text-gray-700 font-medium cursor-pointer">
                  Cotiza IPS
                  <span className="ml-1 text-xs text-gray-400 font-normal">(Instituto de Previsión Social)</span>
                </label>
              </div>
            </div>
          </SectionCard>

          {/* 3. Accesos */}
          <SectionCard title="Accesos del sistema" icon="🔐">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fLabel}>Nivel de acceso</label>
                <select name="nivel" value={form.nivel} onChange={handleChange} className={fSelect}>
                  <option value="usuario">Usuario</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              <div>
                <label className={fLabel}>Área</label>
                <select name="area" value={form.area} onChange={handleChange} className={fSelect}>
                  <option value="ventas">Ventas</option>
                  <option value="soporte">Soporte</option>
                  <option value="finanzas">Finanzas</option>
                  <option value="operaciones">Operaciones</option>
                  <option value="administracion">Administración</option>
                </select>
              </div>
              <div>
                <label className={fLabel}>Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} className={fSelect}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>
          </SectionCard>

          {/* 4. Seguridad */}
          <SectionCard title="Seguridad" icon="🔑">
            <p className="text-xs text-gray-400 mb-4">
              Dejar en blanco para mantener la contraseña actual.
            </p>
            <div className="max-w-xs">
              <label className={fLabel}>Nueva contraseña</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} name="password" value={form.password}
                  onChange={handleChange} placeholder="Mínimo 6 caracteres"
                  className={`${fInput} pr-10`} />
                <button type="button" onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>
          </SectionCard>

          <div className="flex items-center gap-3">
            <button type="submit"
              className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors">
              Guardar cambios
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors px-4 py-2.5">
              Cancelar
            </button>
          </div>

        </form>
      )}

      {/* Zona peligrosa */}
      <div className="bg-white rounded-xl border border-red-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-red-50">
          <span className="text-base">⚠️</span>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Zona peligrosa</h3>
        </div>
        {!showDel ? (
          <button type="button" onClick={() => setShowDel(true)}
            className="text-sm text-red-600 hover:text-red-800 font-medium border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
            Eliminar este usuario
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-700 font-medium">
              ¿Confirmar eliminación de <strong>{usuario.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={handleEliminar}
                className="text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                Sí, eliminar
              </button>
              <button type="button" onClick={() => setShowDel(false)}
                className="text-sm text-gray-500 hover:text-gray-800 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Wrapper Suspense (requerido por useSearchParams) ──────────────────────────

export default function UsuarioDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando…</div>
    }>
      <UsuarioDetailContent />
    </Suspense>
  );
}
