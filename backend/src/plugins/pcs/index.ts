import type { FastifyPluginAsync } from "fastify";
import pcsRoutes from "./routes/pcs.js";

const pcsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(pcsRoutes);
};

export default pcsPlugin;
