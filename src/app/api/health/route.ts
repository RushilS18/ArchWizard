import { getClientId, ratelimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await ratelimit.limit(getClientId(request));

    const rateLimitHeaders = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    };

    if (!result.success) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((result.reset - Date.now()) / 1000),
      );

      return Response.json(
        { error: "rate_limit_exceeded" },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    return Response.json(
      { status: "ok", timestamp: new Date().toISOString() },
      {
        status: 200,
        headers: rateLimitHeaders,
      },
    );
  } catch {
    return Response.json(
      { error: "service_unavailable" },
      { status: 503 },
    );
  }
}
