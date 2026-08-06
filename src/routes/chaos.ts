// /api/config - read/update/reset the in-memory chaos knob. Deliberately NOT
// subject to the chaos it configures (no artificial latency, no simulated
// failures), so the UI can always turn things back off.

import type { FastifyPluginAsync } from "fastify";
import { getConfig, resetConfig, updateConfig, type ChaosConfigPatch } from "../chaosConfig";

export const chaosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => getConfig());

  app.put("/", async (request, reply) => {
    try {
      return updateConfig((request.body as ChaosConfigPatch) ?? {});
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post("/reset", async () => resetConfig());
};
