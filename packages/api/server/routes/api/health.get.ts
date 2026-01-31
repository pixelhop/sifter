import { defineEventHandler } from "h3";
import { testDatabaseConnection } from "../../utils/prisma";

export default defineEventHandler(async () => {
  const dbConnected = await testDatabaseConnection();

  return {
    status: dbConnected ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbConnected ? "connected" : "disconnected",
      },
    },
  };
});
