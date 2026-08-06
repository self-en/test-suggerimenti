// In-memory "chaos" configuration: how slow the fake API layer and the fake
// DB layer should be, and how often requests should fail outright. This is
// intentionally process-local (no persistence) - it's a test knob, not app
// data. Restarting the app resets it to sane defaults (everything off).
//
// Named chaosConfig (not just `config`) to keep it clearly distinct from
// src/platform/config.ts, which is the platform's env-var contract module.

import type { LatencyConfig } from "./simulate";

export interface ChaosConfig {
  apiLatency: LatencyConfig;
  dbLatency: LatencyConfig;
  errorRate: number;
}

export const DEFAULTS: Readonly<ChaosConfig> = Object.freeze({
  apiLatency: { enabled: false, minMs: 200, maxMs: 1500 },
  dbLatency: { enabled: false, minMs: 200, maxMs: 2000 },
  errorRate: 0,
});

function clone(obj: ChaosConfig): ChaosConfig {
  return JSON.parse(JSON.stringify(obj)) as ChaosConfig;
}

let current: ChaosConfig = clone(DEFAULTS);

export function getConfig(): ChaosConfig {
  return clone(current);
}

export interface ChaosConfigPatch {
  apiLatency?: Partial<LatencyConfig>;
  dbLatency?: Partial<LatencyConfig>;
  errorRate?: number;
}

function validateLatency(name: string, patch: Partial<LatencyConfig>, base: LatencyConfig): LatencyConfig {
  const merged = { ...base, ...patch };
  if (typeof merged.enabled !== "boolean") {
    throw new Error(`${name}.enabled deve essere booleano`);
  }
  if (!Number.isFinite(merged.minMs) || merged.minMs < 0) {
    throw new Error(`${name}.minMs deve essere un numero >= 0`);
  }
  if (!Number.isFinite(merged.maxMs) || merged.maxMs < merged.minMs) {
    throw new Error(`${name}.maxMs deve essere un numero >= minMs`);
  }
  if (merged.maxMs > 60_000) {
    throw new Error(`${name}.maxMs non puo' superare 60000 (60s)`);
  }
  return merged;
}

export function updateConfig(patch: ChaosConfigPatch = {}): ChaosConfig {
  const next = clone(current);

  if (patch.apiLatency) {
    next.apiLatency = validateLatency("apiLatency", patch.apiLatency, current.apiLatency);
  }
  if (patch.dbLatency) {
    next.dbLatency = validateLatency("dbLatency", patch.dbLatency, current.dbLatency);
  }
  if (patch.errorRate !== undefined) {
    const rate = Number(patch.errorRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new Error("errorRate deve essere un numero tra 0 e 1");
    }
    next.errorRate = rate;
  }

  current = next;
  return getConfig();
}

export function resetConfig(): ChaosConfig {
  current = clone(DEFAULTS);
  return getConfig();
}
