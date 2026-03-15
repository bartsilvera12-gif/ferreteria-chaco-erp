"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { saveUsuario, emailExiste } from "@/lib/usuarios/storage";
import { createUser, getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AreaUsuario, NivelUsuario, TipoContrato } from "@/lib/usuarios/types";

// ── Helpers UI ────────────────────────────────────────────────────────────────

const fLabel  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInput  = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white";
const fSelect = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white";

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

// ── Página ────────────────────────────────────────────────────────────────────

export default function NuevoUsuarioPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    // Datos personales
    nombre:           "",
    email:            "",
    telefono:         "",
    fecha_nacimiento: "",
    // Datos laborales
    fecha_ingreso:        "",
    tipo_contrato:        "salario" as TipoContrato,
    salario_base:         "",
    porcentaje_comision:  "",
    ips:                  false,
    // Accesos
    nivel: "usuario" as NivelUsuario,
    area:  "ventas"  as AreaUsuario,
    estado: "activo" as "activo" | "inactivo",
    // Seguridad
    password:  "",
    password2: "",
  });

  const [showPwd,   setShowPwd]   = useState(false);
  const [showPwd2,  setShowPwd2]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const showComision = form.tipo_contrato === "comision" || form.tipo_contrato === "mixto";
  const showSalario  = form.tipo_contrato !== "comision";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nombre.trim())              { setError("El nombre es obligatorio."); return; }
    if (!form.email.trim())               { setError("El email es obligatorio.");  return; }
    if (!form.password)                   { setError("La contraseña es obligatoria."); return; }
    if (form.password.length < 6)         { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (form.password !== form.password2) { setError("Las contraseñas no coinciden."); return; }
    if (emailExiste(form.email))          { setError("Ya existe un usuario con ese email."); return; }

    setGuardando(true);

    console.log("Email enviado al backend:", form.email);

    try {
      // 1 — Crear usuario en Supabase Auth
      await createUser(form.email.trim().toLowerCase(), form.password);

      // 2 — Obtener empresa_id del administrador actual
      const admin = await getCurrentUser();
      if (!admin) throw new Error("No se pudo obtener el usuario administrador.");

      // 3 — Insertar en tabla usuarios de Supabase
      const { error: dbError } = await supabase.from("usuarios").insert([{
        empresa_id: admin.empresa_id,
        email:      form.email.trim().toLowerCase(),
        rol:        form.nivel,
      }]);
      if (dbError) throw dbError;

    } catch (err: unknown) {
      setGuardando(false);
      const msg = err instanceof Error
        ? err.message
        : (typeof err === "object" && err !== null && "message" in err)
          ? String((err as { message: unknown }).message)
          : String(err);
      setError(`Error al crear usuario: ${msg}`);
      return;
    }

    // 4 — Guardar en localStorage para el ERP (lista local)
    saveUsuario({
      nombre:              form.nombre.trim(),
      email:               form.email.trim().toLowerCase(),
      telefono:            form.telefono.trim() || undefined,
      fecha_nacimiento:    form.fecha_nacimiento || undefined,
      fecha_ingreso:       form.fecha_ingreso    || undefined,
      tipo_contrato:       form.tipo_contrato,
      salario_base:        form.salario_base        ? parseFloat(form.salario_base)       : undefined,
      porcentaje_comision: form.porcentaje_comision ? parseFloat(form.porcentaje_comision): undefined,
      ips:                 form.ips,
      nivel:               form.nivel,
      area:                form.area,
      estado:              form.estado,
      password_hash:       form.password,
    });

    setGuardando(false);
    router.push("/usuarios");
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/usuarios" className="hover:text-gray-700 transition-colors">Usuarios</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Nuevo usuario</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo usuario</h1>
        <p className="text-sm text-gray-500 mt-1">Código generado automáticamente al guardar.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── 1. Datos personales ─────────────────────────────────── */}
        <SectionCard title="Datos personales" icon="👤">
          <div className="space-y-4">
            <div>
              <label className={fLabel}>Nombre completo *</label>
              <input type="text" name="nombre" value={form.nombre} onChange={handleChange}
                placeholder="Ej: JUAN PÉREZ" className={`${fInput} uppercase`} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fLabel}>Email *</label>
                <input type="email" name="email" value={form.email} onChange={handleChange}
                  placeholder="usuario@empresa.com" className={fInput} required />
              </div>
              <div>
                <label className={fLabel}>Teléfono</label>
                <input type="text" name="telefono" value={form.telefono} onChange={handleChange}
                  placeholder="0981-000000" className={fInput} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fLabel}>Fecha de nacimiento</label>
                <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento}
                  onChange={handleChange} className={fInput} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Datos laborales ──────────────────────────────────── */}
        <SectionCard title="Datos laborales" icon="💼">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fLabel}>Fecha de ingreso</label>
                <input type="date" name="fecha_ingreso" value={form.fecha_ingreso}
                  onChange={handleChange} className={fInput} />
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
              <input type="checkbox" id="ips" name="ips" checked={form.ips} onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20" />
              <label htmlFor="ips" className="text-sm text-gray-700 font-medium cursor-pointer">
                Cotiza IPS
                <span className="ml-1 text-xs text-gray-400 font-normal">(Instituto de Previsión Social)</span>
              </label>
            </div>
          </div>
        </SectionCard>

        {/* ── 3. Accesos del sistema ──────────────────────────────── */}
        <SectionCard title="Accesos del sistema" icon="🔐">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Nivel de acceso</label>
              <select name="nivel" value={form.nivel} onChange={handleChange} className={fSelect}>
                <option value="usuario">Usuario</option>
                <option value="supervisor">Supervisor</option>
                <option value="administrador">Administrador</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {form.nivel === "administrador" && "Acceso total al sistema."}
                {form.nivel === "supervisor"    && "Acceso a reportes y aprobaciones."}
                {form.nivel === "usuario"       && "Acceso operativo estándar."}
              </p>
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

        {/* ── 4. Seguridad ────────────────────────────────────────── */}
        <SectionCard title="Seguridad" icon="🔑">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Contraseña *</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} name="password" value={form.password}
                  onChange={handleChange} placeholder="Mínimo 6 caracteres"
                  className={`${fInput} pr-10`} required />
                <button type="button" onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>
            <div>
              <label className={fLabel}>Confirmar contraseña *</label>
              <div className="relative">
                <input type={showPwd2 ? "text" : "password"} name="password2" value={form.password2}
                  onChange={handleChange} placeholder="Repetir contraseña"
                  className={`${fInput} pr-10`} required />
                <button type="button" onClick={() => setShowPwd2((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <EyeIcon open={showPwd2} />
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            La contraseña se almacena localmente. En producción se aplicará hashing seguro.
          </p>
        </SectionCard>

        {/* Acciones */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={guardando}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
            {guardando ? "Creando usuario…" : "Guardar usuario"}
          </button>
          <Link href="/usuarios" className="text-sm text-gray-500 hover:text-gray-800 transition-colors px-4 py-2.5">
            Cancelar
          </Link>
        </div>

      </form>
    </div>
  );
}

// ── Ícono ojo ─────────────────────────────────────────────────────────────────

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
