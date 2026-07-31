// Helpers to simulate artificial latency / failures ("chaos") and to safely
// parse per-request overrides coming from query params. Kept dependency-free
// on purpose so it's easy to read/reuse.

const MAX_DELAY_MS = 30_000; // hard safety cap, no matter what is requested

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// Resolves how long to sleep for this call: an explicit per-request override
// wins over the global latency config; the global config only fires if
// `enabled` and picks a random value in [minMs, maxMs].
function resolveDelay(latencyCfg, overrideMs) {
  if (typeof overrideMs === "number" && Number.isFinite(overrideMs)) {
    return clamp(overrideMs, 0, MAX_DELAY_MS);
  }
  if (!latencyCfg || !latencyCfg.enabled) return 0;
  return clamp(randomInt(latencyCfg.minMs, latencyCfg.maxMs), 0, MAX_DELAY_MS);
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function parseNumberParam(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolParam(v) {
  return v === "true" || v === "1" || v === 1 || v === true;
}

module.exports = {
  MAX_DELAY_MS,
  sleep,
  randomInt,
  resolveDelay,
  clamp,
  parseNumberParam,
  parseBoolParam,
};
