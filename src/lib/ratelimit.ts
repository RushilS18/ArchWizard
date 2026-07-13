import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  prefix: "archwizard:ratelimit",
  analytics: false,
});

export function getClientId(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor === null) {
    return "anonymous";
  }
  return forwardedFor.split(",")[0]!.trim();
}
