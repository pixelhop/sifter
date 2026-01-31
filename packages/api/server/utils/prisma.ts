import { usePrismaClient } from "db";

export { usePrismaClient };

/**
 * Test the database connection
 * Returns true if connected, false otherwise
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = usePrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
}
