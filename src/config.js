// In-memory "chaos" configuration: how slow the fake API layer and the fake
// DB layer should be, and how often requests should fail outright. This is
// intentionally process-local (no persistence) - it's a test knob, not app
// data. Restarting the app resets it to sane defaults (everything off).

const DEFAULTS = Object.freeze({
  apiLatency: { enabled: false, minMs: 200, maxMs: 1500 },
  dbLatency: { enabled: false, minMs: 200, maxMs: 2000 },
  errorRate: 0,
});

let current = clone(DEFAULTS);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getConfig() {
  return clone(current);
}

function validateLatency(name, patch, base) {
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

function updateConfig(patch = {}) {
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

function resetConfig() {
  current = clone(DEFAULTS);
  return getConfig();
}

module.exports = { getConfig, updateConfig, resetConfig, DEFAULTS };
