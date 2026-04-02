import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("dev-secret-change-in-production-minimum-32-chars"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
