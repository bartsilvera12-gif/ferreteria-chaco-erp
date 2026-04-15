"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchChatChannels, type ChatChannelRow } from "@/lib/chat/actions";
import {
  addAgentToQueue,
  deleteQueueAdmin,
  fetchQueueAdmin,
  listAgentsForQueue,
  listQueueChannelLinks,
  listUsuariosForQueuePick,
  removeQueueAgent,
  saveQueueAdmin,
  setQueueChannelLinks,
  updateQueueAgent,
  type ChatQueueAdminRow,
  type QueueAgentRow,
  type UsuarioPickRow,
} from "@/lib/chat/queue-admin-actions";
import { getMisModulos } from "@/lib/empresas/actions";

function hasOmnichannel(slugs: string[]) {
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

const STRATS: { value: string; label: string }[] = [
  { value: "least_load", label: "Menor carga" },
  { value: "round_robin", label: "Round robin" },
  { value: "manual_pull", label: "Manual (sin auto-asignación)" },
];

export default function EditarColaPage() {
  const router = useRouter();
  const params = useParams();
  const queueId = typeof params?.queueId === "string" ? params.queueId : "";

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<ChatQueueAdminRow | null>(null);
  const [channels, setChannels] = useState<ChatChannelRow[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [agents, setAgents] = useState<QueueAgentRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioPickRow[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [channelType, setChannelType] = useState<string>("");
  const [strategy, setStrategy] = useState("least_load");
  const [priority, setPriority] = useState(0);

  const load = useCallback(async () => {
    if (!queueId) return;
    setLoading(true);
    setError(null);
    try {
      const [q, chRows, links, ag, users] = await Promise.all([
        fetchQueueAdmin(queueId),
        fetchChatChannels(),
        listQueueChannelLinks(queueId),
        listAgentsForQueue(queueId),
        listUsuariosForQueuePick(),
      ]);
      setQueue(q);
      setChannels(chRows);
      setLinked(links.map((l) => l.channel_id));
      setAgents(ag);
      setUsuarios(users);
      if (q) {
        setNombre(q.nombre);
        setDescripcion(q.descripcion ?? "");
        setIsActive(q.is_active);
        setChannelType(q.channel_type ?? "");
        setStrategy(q.distribution_strategy);
        setPriority(q.priority ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [queueId]);

  useEffect(() => {
    getMisModulos()
      .then((mods) => setAllowed(hasOmnichannel(mods.map((m) => m.slug))))
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (allowed && queueId) void load();
  }, [allowed, queueId, load]);

  async function handleSaveQueue() {
    if (!queueId) return;
    setSaving(true);
    setError(null);
    try {
      await saveQueueAdmin({
        id: queueId,
        nombre,
        descripcion: descripcion || null,
        is_active: isActive,
        channel_type: channelType || null,
        distribution_strategy: strategy,
        priority,
      });
      await setQueueChannelLinks(queueId, linked);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAgent() {
    if (!pickUser) return;
    setError(null);
    try {
      await addAgentToQueue({ queue_id: queueId, usuario_id: pickUser });
      setPickUser("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDeleteQueue() {
    if (!confirm("¿Eliminar esta cola? Los agentes asociados se eliminarán.")) return;
    try {
      await deleteQueueAdmin(queueId);
      router.push("/configuracion/colas");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  }

  if (allowed === null || loading) {
    return <div className="py-24 text-center text-sm text-slate-400">Cargando…</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Sin acceso. <Link href="/configuracion">Volver</Link>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-slate-700">Cola no encontrada.</p>
        <Link href="/configuracion/colas" className="text-sm font-semibold text-[#0EA5E9] hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl pb-12">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracion/colas" className="hover:text-slate-800">
          Colas
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate">{nombre}</span>
      </nav>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Editar cola</h1>
        <button
          type="button"
          onClick={() => void handleDeleteQueue()}
          className="text-sm font-semibold text-red-600 hover:underline"
        >
          Eliminar cola
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Datos generales</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nombre</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Descripción</label>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Estrategia</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {STRATS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Prioridad</label>
            <input
              type="number"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
            Filtro legado por tipo (opcional)
          </label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={channelType}
            onChange={(e) => setChannelType(e.target.value)}
          >
            <option value="">Todos los canales</option>
            <option value="whatsapp">whatsapp</option>
            <option value="facebook">facebook</option>
            <option value="instagram">instagram</option>
            <option value="linkedin">linkedin</option>
            <option value="email">email</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Preferí asociar canales explícitos abajo; este campo se mantiene por compatibilidad.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Cola activa
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Canales en esta cola</h2>
        <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={linked.includes(c.id)}
                onChange={(e) => {
                  setLinked((prev) =>
                    e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                  );
                }}
                id={`ch-${c.id}`}
              />
              <label htmlFor={`ch-${c.id}`} className="cursor-pointer flex-1 truncate">
                <span className="font-medium text-slate-800">{c.nombre ?? c.type}</span>{" "}
                <span className="text-slate-400">({c.type})</span>
              </label>
            </li>
          ))}
        </ul>
        {channels.length === 0 && <p className="text-sm text-slate-500">No hay canales en la empresa.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Agentes</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Agregar usuario</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={pickUser}
              onChange={(e) => setPickUser(e.target.value)}
            >
              <option value="">Elegir…</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleAddAgent()}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Añadir
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-2">Usuario</th>
                <th className="pb-2 pr-2">Máx.</th>
                <th className="pb-2 pr-2">Prior.</th>
                <th className="pb-2 pr-2">Nuevos</th>
                <th className="pb-2 pr-2">Activo</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <AgentEditorRow key={a.id} agent={a} onChange={() => void load()} />
              ))}
            </tbody>
          </table>
          {agents.length === 0 && <p className="text-sm text-slate-500 pt-2">Sin agentes en esta cola.</p>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveQueue()}
          className="rounded-xl bg-[#0EA5E9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cola y canales"}
        </button>
        <Link
          href="/configuracion/colas"
          className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}

function AgentEditorRow({ agent, onChange }: { agent: QueueAgentRow; onChange: () => void }) {
  const [maxC, setMaxC] = useState(agent.max_conversations);
  const [prio, setPrio] = useState(agent.priority_in_queue);
  const [recv, setRecv] = useState(agent.receives_new_chats);
  const [active, setActive] = useState(agent.is_active);

  async function persist() {
    await updateQueueAgent({
      id: agent.id,
      max_conversations: maxC,
      is_online: agent.is_online,
      is_active: active,
      receives_new_chats: recv,
      priority_in_queue: prio,
    });
    onChange();
  }

  async function remove() {
    if (!confirm("¿Quitar este agente de la cola?")) return;
    await removeQueueAgent(agent.id);
    onChange();
  }

  return (
    <tr className="border-b border-slate-50">
      <td className="py-2 pr-2">
        <span className="font-medium text-slate-800">{agent.nombre}</span>
        <span className="block text-xs text-slate-400 truncate max-w-[180px]">{agent.email}</span>
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          className="w-16 border border-slate-200 rounded px-1 py-0.5 text-xs"
          value={maxC}
          onChange={(e) => setMaxC(Number(e.target.value) || 1)}
          onBlur={() => void persist()}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-14 border border-slate-200 rounded px-1 py-0.5 text-xs"
          value={prio}
          onChange={(e) => setPrio(Number(e.target.value) || 0)}
          onBlur={() => void persist()}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          checked={recv}
          onChange={(e) => {
            setRecv(e.target.checked);
            void updateQueueAgent({
              id: agent.id,
              max_conversations: maxC,
              is_online: agent.is_online,
              is_active: active,
              receives_new_chats: e.target.checked,
              priority_in_queue: prio,
            }).then(onChange);
          }}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
            void updateQueueAgent({
              id: agent.id,
              max_conversations: maxC,
              is_online: agent.is_online,
              is_active: e.target.checked,
              receives_new_chats: recv,
              priority_in_queue: prio,
            }).then(onChange);
          }}
        />
      </td>
      <td className="py-2">
        <button type="button" onClick={() => void remove()} className="text-xs font-semibold text-red-600 hover:underline">
          Quitar
        </button>
      </td>
    </tr>
  );
}
