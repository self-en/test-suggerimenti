// Minimal starter app scaffolded by the self-en platform. Serves a landing page
// and a /healthz probe, and (if a database is wired) does a one-off SELECT 1 at
// startup without crashing if the DB is unreachable.
const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3000;
const repo = process.env.REPO_NAME || "test-suggerimenti";

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.get("/", (_req, res) => {
  res
    .type("html")
    .send(
      `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${repo}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
      .card { text-align: center; padding: 2rem 3rem; }
      h1 { margin: 0 0 .5rem; font-size: 2rem; }
      p { margin: .25rem 0; color: #94a3b8; }
      code { background: #1e293b; padding: .15rem .4rem; border-radius: .3rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Ciao da ${repo} 👋</h1>
      <p>Questa anteprima è stata creata dalla piattaforma self-en.</p>
      <p>Modifica <code>server.js</code> e fai push: la tua anteprima si aggiorna da sola.</p>
    </div>
  </body>
</html>`
    );
});

app.listen(port, () => console.log(`[app] listening on :${port}`));

// Best-effort DB connectivity check. Prefers discrete PG* env vars (set by the
// chart) to avoid URL-encoding issues; falls back to DATABASE_URL. Never crashes
// the process - a preview should come up even if the DB isn't ready yet.
async function checkDb() {
  const hasDiscrete = !!process.env.PGHOST;
  const hasUrl = !!process.env.DATABASE_URL;
  if (!hasDiscrete && !hasUrl) return;
  try {
    const { Pool } = require("pg");
    const pool = hasDiscrete ? new Pool() : new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("SELECT 1");
    console.log("[app] database connection ok");
    await pool.end();
  } catch (err) {
    console.error("[app] database check failed (continuing):", err.message);
  }
}

void checkDb();
