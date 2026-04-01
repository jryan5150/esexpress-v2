import { type FastifyPluginAsync } from "fastify";
import propxRoutes from "./routes/propx.js";

const ingestionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(propxRoutes);
  // Logistiq routes will be added in Tasks 1.4-1.6
};

export default ingestionPlugin;
