import { buildApp } from "./app.js";
import { loadConfig } from "./lib/config.js";
import { getLoggerConfig } from "./lib/logger.js";
import { startScheduler } from "./scheduler.js";

async function start() {
  const config = loadConfig();
  const app = buildApp({
    logger: getLoggerConfig(config.NODE_ENV),
  });

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`Server listening on port ${config.PORT}`);

    // Start cron scheduler after DB is connected
    if (app.db) {
      startScheduler(app.db);
    } else {
      console.warn("[server] No database connection — scheduler not started");
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

start();
