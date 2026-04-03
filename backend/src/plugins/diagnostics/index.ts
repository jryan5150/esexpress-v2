import { type FastifyPluginAsync } from "fastify";
import diagRoutes from "./routes/diag.js";

const diagnosticsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(diagRoutes);
};

export default diagnosticsPlugin;
