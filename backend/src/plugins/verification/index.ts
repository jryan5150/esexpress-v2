import type { FastifyPluginAsync } from "fastify";
import photosRoutes from "./routes/photos.js";
import bolRoutes from "./routes/bol.js";
import jotformRoutes from "./routes/jotform.js";

const verificationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(photosRoutes);
  fastify.register(bolRoutes);
  fastify.register(jotformRoutes);
};

export default verificationPlugin;
