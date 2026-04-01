import { type FastifyPluginAsync } from "fastify";
import propxRoutes from "./routes/propx.js";
import logistiqRoutes from "./routes/logistiq.js";

const ingestionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(propxRoutes);
  fastify.register(logistiqRoutes);
};

export default ingestionPlugin;
