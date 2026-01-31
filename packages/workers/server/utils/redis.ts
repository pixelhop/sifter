import IORedis from "ioredis";
import { sleep } from "./sleep";

let redis: IORedis;
export async function useRedis() {
  if (redis) {
    return redis;
  }

  // we have to wait for the railway container to be ready to use private networking
  await sleep(3000);

  // const { redisHost, redisPort, redisPassword } = useRuntimeConfig();
  // redis = new IORedis({
  //   host: redisHost,
  //   port: redisPort ? Number(redisPort) : undefined,
  //   password: redisPassword,
  //   maxRetriesPerRequest: null,
  // });

  const { redisUrl } = useRuntimeConfig();
  if (!redisUrl) {
    throw new Error("runtimeConfig.redisUrl is not set for workers service");
  }

  redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  return redis;
}
