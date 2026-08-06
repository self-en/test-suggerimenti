// Postgres wiring. Follows the same contract as the scaffold's checkDb():
// prefer the discrete PG* env vars (set by the Helm chart) over DATABASE_URL to
// dodge URL-encoding pitfalls with generated passwords. Unlike that one-off
// check, we keep a live Pool around and retry schema creation in the background
// so the process never crashes just because the branch database isn't ready yet
// (the PreSync hook that creates it can still be running when this pod starts).
//
// Logging goes through the Fastify logger passed in by src/server.ts, never
// console.log: only pino records are bridged to OTLP (and carry the trace
// context) on the `main` branch.

import pg from "pg";
import type { FastifyBaseLogger } from "fastify";

const hasDiscrete = !!process.env.PGHOST;
const hasUrl = !!process.env.DATABASE_URL;

// pg reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE itself when no options
// are given, which is why the discrete branch passes nothing.
export const pool: pg.Pool | null = hasDiscrete
  ? new pg.Pool()
  : hasUrl
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
    : null;

let ready = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  db_duration_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  simulated_api_delay_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  simulated_db_delay_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_error BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_request_metrics_ts ON request_metrics (ts);
CREATE INDEX IF NOT EXISTS idx_request_metrics_path ON request_metrics (method, path);
`;

export async function initSchemaWithRetry(log: FastifyBaseLogger): Promise<void> {
  if (!pool) {
    log.warn(
      "[db] nessun PGHOST/DATABASE_URL impostato: l'app parte ma le rotte /api/todos e /api/metrics risponderanno 503."
    );
    return;
  }

  const delays = [1000, 2000, 3000, 5000, 5000, 5000, 10000];
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await pool.query(SCHEMA_SQL);
      ready = true;
      log.info("[db] schema pronto (todos, request_metrics)");
      return;
    } catch (err) {
      const wait = delays[Math.min(attempt, delays.length - 1)];
      log.error(
        `[db] init schema fallito (tentativo ${attempt + 1}): ${(err as Error).message} - riprovo tra ${wait}ms`
      );
      await sleep(wait);
    }
  }

  log.error("[db] impossibile inizializzare lo schema dopo molti tentativi, continuo a riprovare in background");
  // keep retrying forever, slowly, without blocking startup
  setInterval(() => {
    if (ready || !pool) return;
    pool
      .query(SCHEMA_SQL)
      .then(() => {
        ready = true;
        log.info("[db] schema pronto (todos, request_metrics)");
      })
      .catch((err: Error) => log.error(`[db] ancora non pronto: ${err.message}`));
  }, 15000);
}

export function isReady(): boolean {
  return ready && !!pool;
}

// Coarse state for /api/info (the React landing page renders it as a badge).
export function dbStatus(): "connected" | "connecting" | "not-configured" {
  if (!pool) return "not-configured";
  return ready ? "connected" : "connecting";
}

// Narrowed accessor for the route modules: they only run behind the isReady()
// guard, so the pool is non-null there and they shouldn't have to re-check.
export function requirePool(): pg.Pool {
  if (!pool) throw new Error("Database non configurato");
  return pool;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
