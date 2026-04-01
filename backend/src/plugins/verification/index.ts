import type { FastifyPluginAsync } from "fastify";
import photosRoutes from "./routes/photos.js";
import bolRoutes from "./routes/bol.js";

const verificationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(photosRoutes);
  fastify.register(bolRoutes);
};

export default verificationPlugin;
