/**
 * Construye payload `template` para Meta Cloud API / YCloud a partir del snapshot de plantilla
 * y variables por slot ({{1}}, {{2}}, {{nombre}}, …).
 */
import "server-only";
import {
  isHttpsUrl,
  logTemplatePayloadHeaderImage,
  templateSnapshotHasHeaderImage,
} from "@/lib/campaigns/campaign-header-image";

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

export function getBodyComponentText(componentsJson: unknown[]): string {
  const comps = Array.isArray(componentsJson)
    ? (componentsJson as { type?: string; text?: string }[])
    : [];
  const body = comps.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
  return String(body?.text ?? "").trim();
}

/**
 * Slots únicos del body en orden estable:
 * - Solo placeholders numéricos {{1}}{{2}}: orden 1, 2, 3…
 * - Con al menos un nombre {{nombre}}: orden de primera aparición en el texto (incluye mixtos).
 */
export function extractBodyPlaceholderKeysOrderedFromText(bodyText: string): string[] {
  const matches = [...bodyText.matchAll(PLACEHOLDER_RE)].map((m) => m[1].trim()).filter(Boolean);
  if (matches.length === 0) return [];

  const orderedUnique: string[] = [];
  const seen = new Set<string>();
  for (const k of matches) {
    if (!seen.has(k)) {
      seen.add(k);
      orderedUnique.push(k);
    }
  }

  const allNumeric = orderedUnique.every((k) => /^\d+$/.test(k));
  if (allNumeric) {
    return [...orderedUnique].sort((a, b) => Number(a) - Number(b));
  }
  return orderedUnique;
}

/** Alias semántico: placeholders únicos en orden estable (véase extractBodyPlaceholderKeysOrderedFromText). */
export function extractTemplatePlaceholders(text: string): string[] {
  return extractBodyPlaceholderKeysOrderedFromText(text);
}

export function extractNumericSlots(text: string): string[] {
  const re = /\{\{(\d+)\}\}/g;
  const nums: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const slot = m[1];
    if (!seen.has(slot)) {
      seen.add(slot);
      nums.push(slot);
    }
  }
  return nums.sort((a, b) => Number(a) - Number(b));
}

export function extractNamedPlaceholders(text: string): string[] {
  return extractTemplatePlaceholders(text).filter((k) => !/^\d+$/.test(k));
}

export function extractBodyPlaceholderKeysOrdered(componentsJson: unknown[]): string[] {
  return extractBodyPlaceholderKeysOrderedFromText(getBodyComponentText(componentsJson));
}

/** Compatibilidad: solo {{1}}, {{2}}, … ordenados numéricamente. */
export function extractBodyVariableSlotsOrdered(componentsJson: unknown[]): string[] {
  return extractNumericSlots(getBodyComponentText(componentsJson));
}

export type CampaignTemplateVarsResolvedLog = {
  campaign_id: string;
  recipient_id: string;
  template_name: string;
  placeholders_count: number;
  params_count: number;
  missing_placeholders: string[];
};

/** Log seguro (sin tokens ni PII de contenido). */
export function logCampaignTemplateVarsResolved(evt: CampaignTemplateVarsResolvedLog): void {
  console.info("[campaign-template-vars][resolved]", {
    campaign_id: evt.campaign_id,
    recipient_id: evt.recipient_id,
    template_name: evt.template_name,
    placeholders_count: evt.placeholders_count,
    params_count: evt.params_count,
    missing_placeholders: evt.missing_placeholders,
  });
}

/** `mappedBySlot`: claves "1","2","nombre" → texto final para cada {{…}} */
export function buildMetaCloudTemplatePayload(params: {
  templateName: string;
  languageCode: string;
  componentsSnapshot: unknown[];
  mappedBySlot: Record<string, string>;
  /** URL https pública para HEADER IMAGE (misma para toda la campaña, fase 1). */
  headerImageUrl?: string | null;
}): Record<string, unknown> {
  const components: Array<Record<string, unknown>> = [];
  const needsHeader = templateSnapshotHasHeaderImage(params.componentsSnapshot);
  const headerUrl = String(params.headerImageUrl ?? "").trim();

  if (needsHeader && headerUrl && isHttpsUrl(headerUrl)) {
    try {
      logTemplatePayloadHeaderImage(new URL(headerUrl).hostname);
    } catch {
      logTemplatePayloadHeaderImage("(parse)");
    }
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: headerUrl.slice(0, 4000),
          },
        },
      ],
    });
  }

  const slots = extractBodyPlaceholderKeysOrdered(params.componentsSnapshot);
  const bodyParameters = slots.map((slot) => ({
    type: "text",
    text: String(params.mappedBySlot[slot] ?? "").slice(0, 4096),
  }));

  if (bodyParameters.length > 0) {
    components.push({ type: "body", parameters: bodyParameters });
  }

  const template: Record<string, unknown> = {
    name: params.templateName,
    language: { code: params.languageCode },
  };

  if (components.length > 0) {
    template.components = components;
  }

  return template;
}

/**
 * Texto legible para inbox (plantilla + cuerpo con variables resueltas).
 * Sustituye {{1}} y {{nombre}} usando las claves normalizadas del mapeo.
 */
export function buildCampaignTemplatePreviewText(params: {
  templateName: string;
  languageCode: string;
  componentsSnapshot: unknown[];
  mappedBySlot: Record<string, string>;
}): string {
  const comps = Array.isArray(params.componentsSnapshot)
    ? (params.componentsSnapshot as { type?: string; text?: string }[])
    : [];
  const body = comps.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
  let bodyText = String(body?.text ?? "").trim();
  if (bodyText) {
    bodyText = bodyText.replace(PLACEHOLDER_RE, (_, rawKey: string) => {
      const key = String(rawKey).trim();
      const v = params.mappedBySlot[key];
      return v !== undefined && v !== null ? String(v).trim() : `{{${key}}}`;
    });
  }
  const title = `Plantilla: ${params.templateName} · ${params.languageCode}`;
  if (bodyText) return `${title}\n\n${bodyText}`;
  return `${title}\n\n(Sin cuerpo de texto en snapshot)`;
}
