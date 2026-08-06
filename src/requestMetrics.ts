// Per-request bookkeeping shared between the chaos hooks (which know how much
// artificial delay they injected), the repo layer (which knows how long the DB
// took) and the hook that writes the request_metrics row.
//
// It lives on the Fastify request via a decorator; the module augmentation
// below is what makes `request.metricsCtx` typed everywhere.

import type { FastifyInstance } from "fastify";

export interface MetricsCtx {
  simulatedApiDelayMs: number;
  dbDurationMs: number;
  simulatedDbDelayMs: number;
}

declare module "fastify" {
  interface FastifyRequest {
    metricsCtx: MetricsCtx;
  }
}

export function emptyMetricsCtx(): MetricsCtx {
  return { simulatedApiDelayMs: 0, dbDurationMs: 0, simulatedDbDelayMs: 0 };
}

// Fastify 5 wants reference-type decorators initialised to null and filled in
// per request by a hook (a shared object would leak between requests). The cast
// keeps the declared type free of `| null` for the routes that always run
// behind the hook that sets it; anything outside /api/todos must still guard
// (`request.metricsCtx ?? emptyMetricsCtx()`).
export function decorateMetricsCtx(app: FastifyInstance): void {
  app.decorateRequest("metricsCtx", null as unknown as MetricsCtx);
}
