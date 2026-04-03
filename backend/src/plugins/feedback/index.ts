import type { FastifyPluginAsync } from "fastify";
import feedbackRoutes from "./routes/feedback.js";

const feedbackPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(feedbackRoutes);
};

export default feedbackPlugin;
