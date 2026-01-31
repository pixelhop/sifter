import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3010),

  // Optional: API Keys for future use
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  // Optional: Redis for future queue integration
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let config: Env | null = null;

export function getConfig(): Env {
  if (config) {
    return config;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(result.error.format());
    throw new Error("Invalid environment configuration");
  }

  config = result.data;
  return config;
}

export function validateConfig(): void {
  getConfig();
}
