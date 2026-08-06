// Helpers to simulate artificial latency / failures ("chaos") and to safely
// parse per-request overrides coming from query params. Kept dependency-free
// on purpose so it's easy to read/reuse.

export const MAX_DELAY_MS = 30_000; // hard safety cap, no matter what is requested

export interface LatencyConfig {
  enabled: boolean;
  minMs: number;
  maxMs: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// Resolves how long to sleep for this call: an explicit per-request override
// wins over the global latency config; the global config only fires if
// `enabled` and picks a random value in [minMs, maxMs].
export function resolveDelay(latencyCfg: LatencyConfig | undefined, overrideMs?: number): number {
  if (typeof overrideMs === "number" && Number.isFinite(overrideMs)) {
    return clamp(overrideMs, 0, MAX_DELAY_MS);
  }
  if (!latencyCfg || !latencyCfg.enabled) return 0;
  return clamp(randomInt(latencyCfg.minMs, latencyCfg.maxMs), 0, MAX_DELAY_MS);
}

export function parseNumberParam(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseBoolParam(v: unknown): boolean {
  return v === "true" || v === "1" || v === 1 || v === true;
}
