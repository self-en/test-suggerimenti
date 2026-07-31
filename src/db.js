// Postgres wiring. Follows the same contract as the original scaffold's
// checkDb(): prefer discrete PG* env vars (set by the Helm chart) over
// DATABASE_URL to dodge URL-encoding pitfalls with generated passwords.
// Unlike the original one-off check, we keep a live Pool around and retry
// schema creation in the background so the process never crashes just
// because the branch database isn't ready yet (the PreSync hook that
// creates it can still be running when this pod starts).

const { Pool } = require("pg");

const hasDiscrete = !!process.env.PGHOST;
const hasUrl = !!process.env.DATABASE_URL;

let pool = null;
if (hasDiscrete) {
  pool = new Pool(); // pg reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE itself
} else if (hasUrl) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

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

async function initSchemaWithRetry() {
  if (!pool) {
    console.warn(
      "[db] nessun PGHOST/DATABASE_URL impostato: l'app parte ma le rotte /api/todos e /api/metrics risponderanno 503."
    );
    return;
  }

  const delays = [1000, 2000, 3000, 5000, 5000, 5000, 10000];
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await pool.query(SCHEMA_SQL);
      ready = true;
      console.log("[db] schema pronto (todos, request_metrics)");
      return;
    } catch (err) {
      const wait = delays[Math.min(attempt, delays.length - 1)];
      console.error(
        `[db] init schema fallito (tentativo ${attempt + 1}): ${err.message} - riprovo tra ${wait}ms`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  console.error("[db] impossibile inizializzare lo schema dopo molti tentativi, continuo a riprovare in background");
  // keep retrying forever, slowly, without blocking startup
  setInterval(async () => {
    if (ready) return;
    try {
      await pool.query(SCHEMA_SQL);
      ready = true;
      console.log("[db] schema pronto (todos, request_metrics)");
    } catch (err) {
      console.error(`[db] ancora non pronto: ${err.message}`);
    }
  }, 15000);
}

function isReady() {
  return ready && !!pool;
}

module.exports = { pool, initSchemaWithRetry, isReady };
