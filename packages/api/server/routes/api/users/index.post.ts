import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { z } from "zod";
import { usePrismaClient } from "db";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const input = createUserSchema.parse(body);

  const prisma = usePrismaClient();
  const user = await prisma.users.create({
    data: {
      email: input.email,
      name: input.name ?? null,
    },
  });

  setResponseStatus(event, 201);
  return { user };
});
