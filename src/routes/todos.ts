// The /api/todos surface: the actual "product" being measured. Everything
// chaos-related (artificial latency, simulated failures) and the DB-backed
// request_metrics row are scoped to this plugin, so /api/config and
// /api/metrics stay fast and reliable - you must always be able to steer the
// test from the UI, even while the todos API is being made deliberately awful.

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { isReady, requirePool } from "../db";
import { getConfig } from "../chaosConfig";
import { insertMetric } from "../metricsStore";
import { emptyMetricsCtx } from "../requestMetrics";
import { parseBoolParam, parseNumberParam, resolveDelay, sleep } from "../simulate";
import * as repo from "../todosRepo";

interface TodosQuery {
  apiDelayMs?: string;
  dbDelayMs?: string;
  fail?: string;
}

function dbDelayOverride(request: FastifyRequest): number | undefined {
  return parseNumberParam((request.query as TodosQuery).dbDelayMs);
}

// Copies the repo layer's timings onto the metrics context and unwraps the
// actual result, so each handler stays a one-liner.
function attachDbTiming<T>(request: FastifyRequest, timed: repo.Timed<T>): T {
  request.metricsCtx.dbDurationMs = timed.dbDurationMs;
  request.metricsCtx.simulatedDbDelayMs = timed.simulatedDelayMs;
  return timed.result;
}

export const todosRoutes: FastifyPluginAsync = async (app) => {
  // 1. Chaos: sleep first, then maybe fail outright. An explicit ?apiDelayMs=
  //    / ?fail=true wins over the global config, for reproducible test scripts.
  app.addHook("onRequest", async (request, reply) => {
    request.metricsCtx = emptyMetricsCtx();

    const cfg = getConfig();
    const delay = resolveDelay(cfg.apiLatency, parseNumberParam((request.query as TodosQuery).apiDelayMs));
    request.metricsCtx.simulatedApiDelayMs = delay;
    if (delay > 0) await sleep(delay);

    const forceFail = parseBoolParam((request.query as TodosQuery).fail);
    const randomFail = cfg.errorRate > 0 && Math.random() < cfg.errorRate;
    if (forceFail || randomFail) {
      // Logged as a real error (not just a 503 body) so it shows up with an
      // error severity in the OTLP log stream too - app.log goes through
      // Fastify's pino, which the OTel pino instrumentation bridges.
      request.log.error(
        { forceFail, randomFail },
        `[todos] chaos: simulated failure on ${request.method} ${request.url}`
      );
      return reply.code(503).send({ error: "Errore simulato (chaos testing)" });
    }
  });

  // 2. The database may still be provisioning (PreSync hook) when this pod
  //    starts, so answer honestly instead of throwing.
  app.addHook("onRequest", async (_request, reply) => {
    if (!isReady()) {
      return reply.code(503).send({ error: "Database non disponibile (schema non pronto)" });
    }
  });

  // 3. One request_metrics row per request. reply.elapsedTime covers the whole
  //    request including the simulated delay above, which is the point: the
  //    row records both the total and how much of it was fake.
  app.addHook("onResponse", async (request, reply) => {
    const ctx = request.metricsCtx ?? emptyMetricsCtx();
    // routeOptions.url is the pattern (/api/todos/:id), so metrics aggregate
    // per route rather than exploding one row per id.
    const routePath = request.routeOptions.url ?? request.url.split("?")[0];

    try {
      await insertMetric(requirePool(), {
        method: request.method,
        path: routePath,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
        dbDurationMs: ctx.dbDurationMs,
        simulatedApiDelayMs: ctx.simulatedApiDelayMs,
        simulatedDbDelayMs: ctx.simulatedDbDelayMs,
        isError: reply.statusCode >= 400,
      });
    } catch (err) {
      request.log.error(`[metrics] insert failed: ${(err as Error).message}`);
    }
  });

  app.get("/", async (request, reply) => {
    try {
      return attachDbTiming(request, await repo.listTodos(requirePool(), { dbDelayOverride: dbDelayOverride(request) }));
    } catch (err) {
      request.log.error(err, "[todos] list failed");
      return reply.code(500).send({ error: "Errore interno" });
    }
  });

  app.post("/", async (request, reply) => {
    const body = request.body as { title?: unknown } | undefined;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return reply.code(400).send({ error: "title e' obbligatorio" });

    try {
      const created = attachDbTiming(
        request,
        await repo.createTodo(requirePool(), title, { dbDelayOverride: dbDelayOverride(request) })
      );
      return reply.code(201).send(created);
    } catch (err) {
      request.log.error(err, "[todos] create failed");
      return reply.code(500).send({ error: "Errore interno" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const todo = attachDbTiming(
        request,
        await repo.getTodo(requirePool(), id, { dbDelayOverride: dbDelayOverride(request) })
      );
      if (!todo) return reply.code(404).send({ error: "Non trovato" });
      return todo;
    } catch (err) {
      request.log.error(err, "[todos] get failed");
      return reply.code(500).send({ error: "Errore interno" });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { title?: unknown; completed?: unknown } | undefined;
    const fields: repo.TodoFields = {};
    if (typeof body?.title === "string") fields.title = body.title.trim();
    if (typeof body?.completed === "boolean") fields.completed = body.completed;

    try {
      const todo = attachDbTiming(
        request,
        await repo.updateTodo(requirePool(), id, fields, { dbDelayOverride: dbDelayOverride(request) })
      );
      if (!todo) return reply.code(404).send({ error: "Non trovato" });
      return todo;
    } catch (err) {
      request.log.error(err, "[todos] update failed");
      return reply.code(500).send({ error: "Errore interno" });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const deleted = attachDbTiming(
        request,
        await repo.deleteTodo(requirePool(), id, { dbDelayOverride: dbDelayOverride(request) })
      );
      if (!deleted) return reply.code(404).send({ error: "Non trovato" });
      return reply.code(204).send();
    } catch (err) {
      request.log.error(err, "[todos] delete failed");
      return reply.code(500).send({ error: "Errore interno" });
    }
  });
};
