// Todo app with DB persistence whose real purpose is to generate realistic-
// looking (and controllably bad) traffic - slow API responses, slow DB
// queries, occasional errors - so a metrics-analysis function has something
// real to chew on. See README.md for the full API.
//
// Fastify backend (TypeScript, compiled to CommonJS - see tsconfig.json + the
// OTel note in instrumentation.ts). It serves the built React frontend
// (Vite -> dist/) as static files, exposes the JSON API under /api/* and the
// /healthz probe.
//
// Logs go through Fastify's built-in `pino` logger (`app.log` / `request.log`).
// On `main` the OTel bootstrap auto-instruments pino, so every record carries
// the active trace context (trace_id/span_id) and is shipped to the OTLP
// collector on top of the normal JSON-on-stdout. Use the Fastify logger,
// NEVER console.log (the latter is not bridged to OTLP).

import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { registerPlatformConfig } from "./platform/config";
import { dbStatus, initSchemaWithRetry } from "./db";
import { decorateMetricsCtx } from "./requestMetrics";
import { todosRoutes } from "./routes/todos";
import { chaosRoutes } from "./routes/chaos";
import { metricsRoutes } from "./routes/metrics";

const port = Number(process.env.PORT) || 3000;
const repo = process.env.REPO_NAME || "test-suggerimenti";

// Fastify's built-in request logging is turned off because we emit exactly ONE
// record per request ourselves (see the onResponse hook below), with a severity
// derived from the status code - the built-in pair logs at `info` whatever the
// outcome, so a 503 would not show up as an error in Loki/Grafana.
// Passed via the top-level `disableRequestLogging` flag: it's deprecated in
// Fastify 5 (emits FSTDEP023 once at startup, harmless noise) and removed only
// in Fastify 6, but it's the only stable/documented way to do this on the 5.x
// line the package depends on (`^5.2.1`). Revisit if/when this migrates to
// Fastify 6.
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  disableRequestLogging: true,
});

// Contratto di configurazione con la piattaforma: espone GET /_self-en/config e,
// se manca una variabile obbligatoria dichiarata in self-en.json, mostra la
// pagina "da configurare" invece di far girare l'app a metà. Le variabili si
// dichiarano in self-en.json e si leggono con `config.get("NOME")` - mai
// `process.env` sparso nel codice (`npm run check:contract` lo verifica).
registerPlatformConfig(app);

decorateMetricsCtx(app);

// One log record per HTTP request, for every route (not just /api/todos - see
// the request_metrics hook in routes/todos.ts for that narrower,
// product-specific counterpart). The severity follows the status code so a
// failing request is an ERROR in the logs, not just in the response body.
app.addHook("onResponse", async (request, reply) => {
  const line = `${request.method} ${request.url} ${reply.statusCode} ${reply.elapsedTime.toFixed(1)}ms`;
  const fields = {
    "http.method": request.method,
    "http.target": request.url,
    "http.status_code": reply.statusCode,
    "http.duration_ms": reply.elapsedTime,
  };
  if (reply.statusCode >= 500) request.log.error(fields, line);
  else if (reply.statusCode >= 400) request.log.warn(fields, line);
  else request.log.info(fields, line);
});

app.get("/healthz", async () => ({ status: "ok", repo }));

// The React frontend calls this on load to render the header/badge.
app.get("/api/info", async () => ({
  repo,
  database: dbStatus(),
  branch: process.env.BRANCH_NAME ?? null,
}));

app.register(todosRoutes, { prefix: "/api/todos" });
app.register(chaosRoutes, { prefix: "/api/config" });
app.register(metricsRoutes, { prefix: "/api/metrics" });

// Serve the built React app. Guarded because in local dev `dist` doesn't exist
// (Vite serves the frontend on :5173 and proxies /api here), and @fastify/static
// throws on a missing root. In the container `dist` is always present, one level
// up from build/server.js.
const distDir = path.join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.register(fastifyStatic, { root: distDir, wildcard: false });
  // SPA fallback: any non-API GET that didn't match a static file returns
  // index.html so client-side routing works. Everything else is a real 404.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api") && !request.url.startsWith("/healthz")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });
}

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`[app] listening on :${port}`);
    // Best-effort: create the schema in the background, retrying, without
    // blocking the HTTP server from coming up (so /healthz and the
    // readinessProbe succeed even if the branch database is still being
    // provisioned by the PreSync hook).
    void initSchemaWithRetry(app.log);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
