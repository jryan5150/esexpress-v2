import type { FastifyPluginAsync } from "fastify";
import financeRoutes from "./routes/finance.js";

const financePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(financeRoutes);
};

export default financePlugin;
