import * as Prisma from "@prisma/client";

let prisma: Prisma.PrismaClient | null = null;

function usePrismaClient(): Prisma.PrismaClient {
  if (!prisma) {
    prisma = new Prisma.PrismaClient();
    // prisma.$use(async (params, next) => {
    //   const before = Date.now();

    //   const result = await next(params);

    //   const after = Date.now();

    //   console.log(`Query: ${params.model}.${params.action}`);
    //   console.log(`Params: ${JSON.stringify(params.args)}`);
    //   console.log(`Duration: ${after - before}ms`);

    //   return result;
    // });
  }
  return prisma;
}

export { Prisma, usePrismaClient };
