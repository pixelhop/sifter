import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Add any seed data you want to preload into new environments here.
  // Example:
  // await prisma.users.create({
  //   data: { email: "admin@example.com", name: "Admin" },
  // });
}

main()
  .catch((error) => {
    console.error("Failed to run seed script", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

