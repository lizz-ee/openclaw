import type { GatewayBrowserClient } from "../gateway";
import type { HealthSnapshot, StatusSummary } from "../types";

export type DebugState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown | null;
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
};

export async function loadDebug(state: DebugState) {
  if (!state.client || !state.connected) return;
  if (state.debugLoading) return;
  state.debugLoading = true;
  try {
    const [status, health, models, heartbeat] = await Promise.all([
      state.client.request("status", {}),
      state.client.request("health", {}),
      state.client.request("models.list", {}),
      state.client.request("last-heartbeat", {}),
    ]);
    state.debugStatus = status as StatusSummary;
    state.debugHealth = health as HealthSnapshot;
    const modelPayload = models as { models?: unknown[] } | undefined;
    state.debugModels = Array.isArray(modelPayload?.models) ? modelPayload?.models : [];
    state.debugHeartbeat = heartbeat as unknown;
  } catch (err) {
    state.debugCallError = String(err);
  } finally {
    state.debugLoading = false;
  }
}

export type UsageState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  usageSummary: unknown | null;
};

export async function loadUsage(state: UsageState) {
  if (!state.client || !state.connected) return;
  try {
    const result = await state.client.request("usage.cost", { days: 7 });
    state.usageSummary = result;
  } catch {
    // usage.cost may not be available on all gateways — silently skip
  }
}

export async function callDebugMethod(state: DebugState) {
  if (!state.client || !state.connected) return;
  state.debugCallError = null;
  state.debugCallResult = null;
  try {
    const params = state.debugCallParams.trim()
      ? (JSON.parse(state.debugCallParams) as unknown)
      : {};
    const res = await state.client.request(state.debugCallMethod.trim(), params);
    state.debugCallResult = JSON.stringify(res, null, 2);
  } catch (err) {
    state.debugCallError = String(err);
  }
}
