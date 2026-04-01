import type { FastifyPluginAsync } from "fastify";
import sheetsRoutes from "./routes/sheets.js";

const sheetsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(sheetsRoutes);
};

export default sheetsPlugin;
