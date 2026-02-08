import type { GatewayBrowserClient } from "../gateway";

export type ModelEntry = {
  name?: string;
  id?: string;
  provider?: string;
  [key: string]: unknown;
};

export type ModelsHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  availableModels: ModelEntry[];
  quickModels: string[];
};

/** State needed for service discovery (Ollama, LM Studio, cloud providers). */
export type LocalDiscoveryHost = ModelsHost & {
  ollamaOk: boolean | null;
  lmstudioOk: boolean | null;
};

export function modelDisplayName(m: ModelEntry): string {
  return m.name ?? m.id ?? String(m);
}

export async function loadModels(host: ModelsHost) {
  if (!host.client || !host.connected) return;
  try {
    const res = await host.client.request("models.list", {});
    // Handle both { models: [...] } and direct array responses
    const payload = res as { models?: ModelEntry[] } | ModelEntry[] | undefined;
    if (Array.isArray(payload)) {
      host.availableModels = payload;
    } else {
      host.availableModels = Array.isArray(payload?.models) ? payload.models : [];
    }
  } catch {
    // Non-critical — model list is informational
  }
}

/**
 * Discover models from all configured providers via gateway-side probing.
 * Calls `models.discover` RPC — the gateway fetches /api/tags (Ollama),
 * /v1/models (LM Studio, Nvidia, Anthropic, etc.) server-side (no CORS).
 * The linked dropdown shows ONLY live-discovered models — install/remove
 * models freely without ever touching config.
 */
export async function loadLinkedModels(host: LocalDiscoveryHost) {
  if (!host.client || !host.connected) return;
  try {
    const res = await host.client.request("models.discover", {});
    const data = res as Record<string, { ok: boolean; models: string[] }> | undefined;
    if (!data) return;

    // Update service status dots for Ollama & LM Studio
    host.ollamaOk = data.ollama?.ok ?? null;
    host.lmstudioOk = data.lmstudio?.ok ?? null;

    // Build quick models list from ALL live-discovered providers
    const next: string[] = [];
    for (const [provider, result] of Object.entries(data)) {
      if (!result?.models) continue;
      for (const id of result.models) {
        next.push(`${provider}/${id}`);
      }
    }

    // Only assign if contents actually differ (avoids needless Lit re-renders)
    const prev = host.quickModels;
    if (next.length !== prev.length || !next.every((v, i) => v === prev[i])) {
      host.quickModels = next;
    }
  } catch {
    // Non-critical — gateway may not support models.discover yet
  }
}

/** Fetch gateway status and initialize activeModel from session defaults. */
export async function initActiveModel(
  host: ModelsHost & { activeModel: string | null },
) {
  if (!host.client || !host.connected) return;
  try {
    const res = await host.client.request("status", {});
    const status = res as Record<string, unknown> | undefined;
    // Try top-level primaryModel (may not exist), then sessions.defaults.model
    const sessions = status?.sessions as
      | { defaults?: { model?: string | null } }
      | undefined;
    const defaultModel =
      (status?.primaryModel as string | undefined) ?? sessions?.defaults?.model ?? undefined;
    if (defaultModel && !host.activeModel) {
      host.activeModel = defaultModel;
    }
  } catch {
    // Non-critical
  }
}

export async function swapSessionModel(
  host: ModelsHost & { sessionKey: string },
  modelName: string,
) {
  if (!host.client || !host.connected) return;
  await host.client.request("sessions.patch", {
    key: host.sessionKey,
    model: modelName,
  });
}
