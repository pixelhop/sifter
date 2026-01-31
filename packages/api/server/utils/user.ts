import type { H3Event } from "h3";
import { usePrismaClient } from "./prisma";

const TEST_USER_EMAIL = "test@sifter.fm";

/**
 * Get or create a test user for development
 * TODO: Replace with actual auth when implemented
 */
export async function getCurrentUser(_event: H3Event) {
  const prisma = usePrismaClient();

  // Find or create test user
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        name: "Test User",
        interests: ["technology", "startups", "business"],
      },
    });
  }

  return user;
}
