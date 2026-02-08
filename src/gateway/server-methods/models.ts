import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import { loadConfig } from "../../config/config.js";
import { resolveEnvApiKey, getCustomProviderApiKey } from "../../agents/model-auth.js";
import type { GatewayRequestHandlers } from "./types.js";

type ServiceResult = { ok: boolean; models: string[] };
type DiscoverResult = Record<string, ServiceResult>;

/** Parse OpenAI-compatible /v1/models response: { data: [{ id }] } */
function parseOpenAIModels(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const models = (data as Record<string, unknown>).data;
  if (!Array.isArray(models)) return [];
  const out: string[] = [];
  for (const m of models) {
    if (!m || typeof m !== "object") continue;
    const id = (m as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) out.push(id.trim());
  }
  return out;
}

/** Parse Ollama /api/tags response: { models: [{ name }] } */
function parseOllamaModels(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const models = (data as Record<string, unknown>).models;
  if (!Array.isArray(models)) return [];
  const out: string[] = [];
  for (const m of models) {
    if (!m || typeof m !== "object") continue;
    const name = (m as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) out.push(name.trim());
  }
  return out;
}

/** Resolve API key for a provider — env var first, then config. */
function resolveApiKey(provider: string, cfg: ReturnType<typeof loadConfig>): string | null {
  const envResult = resolveEnvApiKey(provider);
  if (envResult?.apiKey) return envResult.apiKey;
  const customKey = getCustomProviderApiKey(cfg, provider);
  if (customKey) return customKey;
  return null;
}

/** Probe a URL and parse the response. */
async function probe(
  url: string,
  parse: (data: unknown) => string[],
  headers?: Record<string, string>,
): Promise<ServiceResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers,
    });
    if (!res.ok) return { ok: false, models: [] };
    const data: unknown = await res.json();
    return { ok: true, models: parse(data) };
  } catch {
    return { ok: false, models: [] };
  }
}

async function discoverModels(): Promise<DiscoverResult> {
  const cfg = loadConfig();
  const providers = cfg.models?.providers as Record<string, Record<string, unknown>> | undefined;

  const tasks: Array<{ key: string; promise: Promise<ServiceResult> }> = [];

  // Always probe LM Studio on default port
  let lmstudioHandled = false;

  if (providers) {
    for (const [providerKey, providerVal] of Object.entries(providers)) {
      if (!providerVal || typeof providerVal !== "object") continue;
      const providerCfg = providerVal as Record<string, unknown>;
      const baseUrl = typeof providerCfg.baseUrl === "string" ? providerCfg.baseUrl : null;
      const api = typeof providerCfg.api === "string" ? providerCfg.api : null;
      if (!baseUrl) continue;

      if (providerKey === "ollama") {
        // Ollama: use native /api/tags (more reliable than /v1/models)
        const ollamaRoot = baseUrl.replace(/\/v1\/?$/, "");
        tasks.push({
          key: "ollama",
          promise: probe(`${ollamaRoot}/api/tags`, parseOllamaModels),
        });
      } else if (providerKey === "lmstudio") {
        lmstudioHandled = true;
        const lmRoot = baseUrl.replace(/\/v1\/?$/, "");
        tasks.push({
          key: "lmstudio",
          promise: probe(`${lmRoot}/v1/models`, parseOpenAIModels),
        });
      } else if (api === "anthropic-messages") {
        // Anthropic: x-api-key header + anthropic-version
        const apiKey = resolveApiKey(providerKey, cfg);
        if (!apiKey) continue;
        const anthropicUrl = baseUrl.replace(/\/v1\/?$/, "");
        tasks.push({
          key: providerKey,
          promise: probe(`${anthropicUrl}/v1/models`, parseOpenAIModels, {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          }),
        });
      } else if (api === "openai-completions") {
        // OpenAI-compatible (nvidia, openrouter, etc.): Bearer token
        const apiKey = resolveApiKey(providerKey, cfg);
        if (!apiKey) continue;
        const providerUrl = baseUrl.replace(/\/v1\/?$/, "");
        tasks.push({
          key: providerKey,
          promise: probe(`${providerUrl}/v1/models`, parseOpenAIModels, {
            Authorization: `Bearer ${apiKey}`,
          }),
        });
      }
    }
  }

  // Always auto-probe LM Studio on default port if not explicitly configured
  if (!lmstudioHandled) {
    tasks.push({
      key: "lmstudio",
      promise: probe("http://127.0.0.1:1234/v1/models", parseOpenAIModels),
    });
  }

  const results = await Promise.all(tasks.map((t) => t.promise));
  const out: DiscoverResult = {};
  for (let i = 0; i < tasks.length; i++) {
    out[tasks[i].key] = results[i];
  }
  return out;
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const models = await context.loadGatewayModelCatalog();
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "models.discover": async ({ respond }) => {
    try {
      const result = await discoverModels();
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
