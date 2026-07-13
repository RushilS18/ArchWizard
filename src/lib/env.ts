import { z } from "zod";

const envSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

function loadEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (!result.success) {
    const names = [
      ...new Set(
        result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")),
      ),
    ];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(", ")}`,
    );
  }

  return result.data;
}

export const env = loadEnv();
