import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  fetchAgentsForSupervisorUsuarioIds,
  fetchOmnicanalOperatorRole,
  fetchQueueIdsForSupervisorUsuario,
  type OmnicanalOperatorRole,
} from "@/lib/chat/omnicanal-supervision-read";

export type OmnicanalScope = {
  /** Rol en `chat_empresa_operator_roles`; null si no hay fila (ver `agentUsuarioIds` para fallback operador). */
  role: OmnicanalOperatorRole | null;
  /**
   * Colas supervisadas (solo `supervisor`). Vacío en admin (acceso total) y en agente.
   */
  queueIds: string[];
  /**
   * Agentes cuyas conversaciones entran en el alcance operativo.
   * - admin: [] = sin restricción por esta dimensión
   * - supervisor: agentes a cargo
   * - agente: `[usuarioId]`
   * - sin rol pero con `chat_agents`: `[usuarioId]` como vista mínima
   */
  agentUsuarioIds: string[];
};

function normalizeId(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

async function usuarioTieneFilaChatAgents(
  supabase: AppSupabaseClient,
  empresaId: string,
  usuarioId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("chat_agents")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .limit(1);

  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (m.includes("chat_agents") && m.includes("does not exist")) return false;
    throw new Error(error.message);
  }
  return (count ?? 0) > 0;
}

/**
 * Alcance omnicanal unificado para un usuario en una empresa.
 *
 * - **admin**: `queueIds` y `agentUsuarioIds` vacíos → sin filtro por estas listas (acceso total a nivel módulo cuando se aplique).
 * - **supervisor**: colas en `chat_queue_supervisors` + agentes en `chat_supervisor_agents`.
 * - **agente**: `agentUsuarioIds = [usuarioId]`, `queueIds` vacío.
 * - **sin rol** pero con fila en `chat_agents`: `role` null, `agentUsuarioIds = [usuarioId]` (vista mínima tipo operador).
 * - **sin rol** y sin `chat_agents`: todo vacío y `role` null.
 *
 * No aplica filtros a inbox/historial/monitoreo/finalizadas; solo datos para el siguiente paso.
 */
export async function getOmnicanalScope(
  supabase: AppSupabaseClient,
  empresaId: string | null | undefined,
  usuarioId: string | null | undefined
): Promise<OmnicanalScope> {
  const emp = normalizeId(empresaId ?? undefined);
  const uid = normalizeId(usuarioId ?? undefined);
  if (!emp || !uid) {
    return { role: null, queueIds: [], agentUsuarioIds: [] };
  }

  const role = await fetchOmnicanalOperatorRole(supabase, emp, uid);

  if (role === "admin") {
    return { role: "admin", queueIds: [], agentUsuarioIds: [] };
  }

  if (role === "supervisor") {
    const [queueIds, agentUsuarioIds] = await Promise.all([
      fetchQueueIdsForSupervisorUsuario(supabase, emp, uid),
      fetchAgentsForSupervisorUsuarioIds(supabase, emp, uid),
    ]);
    return {
      role: "supervisor",
      queueIds,
      agentUsuarioIds,
    };
  }

  if (role === "agente") {
    return { role: "agente", queueIds: [], agentUsuarioIds: [uid] };
  }

  if (await usuarioTieneFilaChatAgents(supabase, emp, uid)) {
    return { role: null, queueIds: [], agentUsuarioIds: [uid] };
  }

  return { role: null, queueIds: [], agentUsuarioIds: [] };
}
