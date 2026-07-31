const express = require("express");
const { pool, isReady } = require("./db");
const { getSummary, getTimeseries, getRaw, resetMetrics } = require("./metricsStore");
const { parseNumberParam } = require("./simulate");

const router = express.Router();

router.use((req, res, next) => {
  if (!isReady()) {
    return res.status(503).json({ error: "Database non disponibile (schema non pronto)" });
  }
  next();
});

router.get("/summary", async (req, res) => {
  const minutes = Math.min(Math.max(parseNumberParam(req.query.minutes) ?? 60, 1), 1440);
  try {
    const routes = await getSummary(pool, minutes);
    res.json({ windowMinutes: minutes, routes });
  } catch (err) {
    console.error("[metrics] summary failed", err);
    res.status(500).json({ error: "Errore nel calcolo delle metriche" });
  }
});

router.get("/timeseries", async (req, res) => {
  const minutes = Math.min(Math.max(parseNumberParam(req.query.minutes) ?? 60, 1), 1440);
  try {
    const points = await getTimeseries(pool, minutes);
    res.json({ windowMinutes: minutes, points });
  } catch (err) {
    console.error("[metrics] timeseries failed", err);
    res.status(500).json({ error: "Errore nel calcolo della serie temporale" });
  }
});

router.get("/raw", async (req, res) => {
  const limit = Math.min(Math.max(parseNumberParam(req.query.limit) ?? 100, 1), 1000);
  try {
    res.json({ limit, rows: await getRaw(pool, limit) });
  } catch (err) {
    console.error("[metrics] raw failed", err);
    res.status(500).json({ error: "Errore nel recupero delle metriche" });
  }
});

router.delete("/", async (req, res) => {
  try {
    await resetMetrics(pool);
    res.json({ ok: true });
  } catch (err) {
    console.error("[metrics] reset failed", err);
    res.status(500).json({ error: "Errore nel reset delle metriche" });
  }
});

module.exports = router;
