import type { GatewayBrowserClient } from "../gateway";

export type TtsStatusResult = {
  enabled: boolean;
  provider?: string | null;
  voice?: string | null;
  auto?: string | null;
};

export type TtsProviderEntry = {
  name: string;
  configured: boolean;
};

export type TtsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  ttsStatus: TtsStatusResult | null;
  ttsProviders: TtsProviderEntry[];
  ttsBusy: boolean;
};

export async function loadTtsStatus(state: TtsState) {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("tts.status", {})) as TtsStatusResult | undefined;
    if (res) state.ttsStatus = res;
  } catch {
    // tts.status may not be available — silently skip
  }
}

export async function loadTtsProviders(state: TtsState) {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("tts.providers", {})) as
      | { providers?: TtsProviderEntry[] }
      | undefined;
    state.ttsProviders = Array.isArray(res?.providers) ? res.providers : [];
  } catch {
    // tts.providers may not be available — silently skip
  }
}

export async function toggleTts(state: TtsState, enabled: boolean) {
  if (!state.client || !state.connected || state.ttsBusy) return;
  state.ttsBusy = true;
  try {
    await state.client.request(enabled ? "tts.enable" : "tts.disable", {});
    await loadTtsStatus(state);
  } catch {
    // silently skip
  } finally {
    state.ttsBusy = false;
  }
}

export async function setTtsProvider(state: TtsState, provider: string) {
  if (!state.client || !state.connected || state.ttsBusy) return;
  state.ttsBusy = true;
  try {
    await state.client.request("tts.setProvider", { provider });
    await loadTtsStatus(state);
  } catch {
    // silently skip
  } finally {
    state.ttsBusy = false;
  }
}
