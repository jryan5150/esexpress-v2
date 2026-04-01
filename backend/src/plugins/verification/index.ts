import type { FastifyPluginAsync } from "fastify";
import photosRoutes from "./routes/photos.js";

const verificationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(photosRoutes);
  // BOL routes added in Track 6 (Tasks 6.1-6.3)
};

export default verificationPlugin;
