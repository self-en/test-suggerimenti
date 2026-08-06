// /api/metrics - the aggregates the metrics-analysis function under test reads.
// Like /api/config, these routes are never slowed down or failed on purpose.

import type { FastifyPluginAsync } from "fastify";
import { isReady, requirePool } from "../db";
import { getRaw, getSummary, getTimeseries, resetMetrics } from "../metricsStore";
import { clamp, parseNumberParam } from "../simulate";

interface MetricsQuery {
  minutes?: string;
  limit?: string;
}

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (_request, reply) => {
    if (!isReady()) {
      return reply.code(503).send({ error: "Database non disponibile (schema non pronto)" });
    }
  });

  app.get("/summary", async (request, reply) => {
    const minutes = clamp(parseNumberParam((request.query as MetricsQuery).minutes) ?? 60, 1, 1440);
    try {
      return { windowMinutes: minutes, routes: await getSummary(requirePool(), minutes) };
    } catch (err) {
      request.log.error(err, "[metrics] summary failed");
      return reply.code(500).send({ error: "Errore nel calcolo delle metriche" });
    }
  });

  app.get("/timeseries", async (request, reply) => {
    const minutes = clamp(parseNumberParam((request.query as MetricsQuery).minutes) ?? 60, 1, 1440);
    try {
      return { windowMinutes: minutes, points: await getTimeseries(requirePool(), minutes) };
    } catch (err) {
      request.log.error(err, "[metrics] timeseries failed");
      return reply.code(500).send({ error: "Errore nel calcolo della serie temporale" });
    }
  });

  app.get("/raw", async (request, reply) => {
    const limit = clamp(parseNumberParam((request.query as MetricsQuery).limit) ?? 100, 1, 1000);
    try {
      return { limit, rows: await getRaw(requirePool(), limit) };
    } catch (err) {
      request.log.error(err, "[metrics] raw failed");
      return reply.code(500).send({ error: "Errore nel recupero delle metriche" });
    }
  });

  app.delete("/", async (request, reply) => {
    try {
      await resetMetrics(requirePool());
      return { ok: true };
    } catch (err) {
      request.log.error(err, "[metrics] reset failed");
      return reply.code(500).send({ error: "Errore nel reset delle metriche" });
    }
  });
};
