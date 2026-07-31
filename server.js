// Todo app with DB persistence whose real purpose is to generate realistic-
// looking (and controllably bad) traffic - slow API responses, slow DB
// queries, occasional errors - so a metrics-analysis function has something
// real to chew on. See README.md for the full API.

const path = require("path");
const express = require("express");

const { pool, initSchemaWithRetry } = require("./src/db");
const { insertMetric } = require("./src/metricsStore");
const todosRouter = require("./src/routes-todos");
const configRouter = require("./src/routes-config");
const metricsRouter = require("./src/routes-metrics");

const app = express();
const port = Number(process.env.PORT) || 3000;
const repo = process.env.REPO_NAME || "todo-metrics-app";

app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", repo });
});

// Records one row per /api/todos request into request_metrics, capturing
// both the total duration and whatever simulated delay the chaos middleware
// (in routes-todos.js) and the repo layer (in todosRepo.js) attached to
// req.metricsCtx along the way. Mounted first so its timer wraps everything
// downstream, including the simulated latency.
app.use("/api/todos", (req, res, next) => {
  const startNs = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    const ctx = req.metricsCtx || {};
    const routePath = req.route
      ? `/api/todos${req.route.path === "/" ? "" : req.route.path}`
      : req.originalUrl.split("?")[0];

    insertMetric(pool, {
      method: req.method,
      path: routePath,
      statusCode: res.statusCode,
      durationMs,
      dbDurationMs: ctx.dbDurationMs || 0,
      simulatedApiDelayMs: ctx.simulatedApiDelayMs || 0,
      simulatedDbDelayMs: ctx.simulatedDbDelayMs || 0,
      isError: res.statusCode >= 400,
    }).catch((err) => console.error("[metrics] insert failed:", err.message));
  });
  next();
});

app.use("/api/todos", todosRouter);
app.use("/api/config", configRouter);
app.use("/api/metrics", metricsRouter);

app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => console.log(`[app] listening on :${port}`));

// Best-effort: create the schema in the background, retrying, without
// blocking the HTTP server from coming up (so /healthz and readinessProbe
// succeed even if the branch database is still being provisioned).
void initSchemaWithRetry();
