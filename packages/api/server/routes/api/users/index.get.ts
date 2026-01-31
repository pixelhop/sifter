import { defineEventHandler } from "h3";
import { usePrismaClient } from "db";

export default defineEventHandler(async () => {
  const prisma = usePrismaClient();
  const users = await prisma.users.findMany({
    orderBy: { createdAt: "desc" },
  });

  return { users };
});
