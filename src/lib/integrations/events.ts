/**
 * Sistema de eventos para integraciones externas.
 * Base para Webhooks y automatizaciones futuras.
 */

import { sendWebhook } from "./webhooks";

export const EVENT_TYPES = {
  cliente_creado: "cliente_creado",
  factura_creada: "factura_creada",
  pago_registrado: "pago_registrado",
  suscripcion_creada: "suscripcion_creada",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Emite un evento. Registra en consola y envía webhook si WEBHOOK_URL está configurada.
 */
export async function emitEvent(eventName: EventType, payload: Record<string, unknown>) {
  console.log(`[ERP Event] ${eventName}`, payload);

  console.log("[ERP Event] sending webhook...");

  await sendWebhook(eventName, payload);

  console.log("[ERP Event] webhook sent");
}
