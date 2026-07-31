const express = require("express");
const { pool, isReady } = require("./db");
const { getConfig } = require("./config");
const { resolveDelay, sleep, parseNumberParam, parseBoolParam } = require("./simulate");
const repo = require("./todosRepo");

const router = express.Router();

// "Chaos" middleware: only applied to the todos API (the actual product
// surface being measured), not to /api/config or /api/metrics which must
// stay fast and reliable so you can always steer the test from the UI.
router.use(async (req, res, next) => {
  const cfg = getConfig();
  const overrideApiMs = parseNumberParam(req.query.apiDelayMs);
  const forceFail = parseBoolParam(req.query.fail);

  const delay = resolveDelay(cfg.apiLatency, overrideApiMs);
  req.metricsCtx = { simulatedApiDelayMs: delay };

  if (delay > 0) await sleep(delay);

  const randomFail = cfg.errorRate > 0 && Math.random() < cfg.errorRate;
  if (forceFail || randomFail) {
    return res.status(503).json({ error: "Errore simulato (chaos testing)" });
  }
  next();
});

router.use((req, res, next) => {
  if (!isReady()) {
    return res.status(503).json({ error: "Database non disponibile (schema non pronto)" });
  }
  next();
});

function attachDbTiming(req, r) {
  req.metricsCtx.dbDurationMs = r.dbDurationMs;
  req.metricsCtx.simulatedDbDelayMs = r.simulatedDelayMs;
  return r.result;
}

router.get("/", async (req, res) => {
  try {
    const r = await repo.listTodos(pool, { dbDelayOverride: parseNumberParam(req.query.dbDelayMs) });
    res.json(attachDbTiming(req, r));
  } catch (err) {
    console.error("[todos] list failed", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

router.post("/", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "title e' obbligatorio" });

  try {
    const r = await repo.createTodo(pool, title, { dbDelayOverride: parseNumberParam(req.query.dbDelayMs) });
    res.status(201).json(attachDbTiming(req, r));
  } catch (err) {
    console.error("[todos] create failed", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const r = await repo.getTodo(pool, req.params.id, { dbDelayOverride: parseNumberParam(req.query.dbDelayMs) });
    const todo = attachDbTiming(req, r);
    if (!todo) return res.status(404).json({ error: "Non trovato" });
    res.json(todo);
  } catch (err) {
    console.error("[todos] get failed", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

router.patch("/:id", async (req, res) => {
  const fields = {};
  if (typeof req.body?.title === "string") fields.title = req.body.title.trim();
  if (typeof req.body?.completed === "boolean") fields.completed = req.body.completed;

  try {
    const r = await repo.updateTodo(pool, req.params.id, fields, {
      dbDelayOverride: parseNumberParam(req.query.dbDelayMs),
    });
    const todo = attachDbTiming(req, r);
    if (!todo) return res.status(404).json({ error: "Non trovato" });
    res.json(todo);
  } catch (err) {
    console.error("[todos] update failed", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const r = await repo.deleteTodo(pool, req.params.id, { dbDelayOverride: parseNumberParam(req.query.dbDelayMs) });
    const deleted = attachDbTiming(req, r);
    if (!deleted) return res.status(404).json({ error: "Non trovato" });
    res.status(204).end();
  } catch (err) {
    console.error("[todos] delete failed", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

module.exports = router;
