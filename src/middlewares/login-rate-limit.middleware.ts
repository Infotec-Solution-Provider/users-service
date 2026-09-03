import { createHash } from "node:crypto";
import { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let nextCleanupAt = 0;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const limit = positiveInteger(process.env["AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS"], 10);
const windowMs = positiveInteger(process.env["AUTH_LOGIN_RATE_LIMIT_WINDOW_MS"], 60_000);

export default function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const instance = typeof req.body?.instance === "string" ? req.body.instance.trim().toLowerCase() : "";
  const login = typeof req.body?.LOGIN === "string" ? req.body.LOGIN.trim().toLowerCase() : "";
  const source = `${req.ip || req.socket.remoteAddress || "unknown"}|${instance}|${login}`;
  const key = createHash("sha256").update(source).digest("hex");
  const now = Date.now();

  if (now >= nextCleanupAt) {
    for (const [bucketKey, current] of buckets) {
      if (current.resetAt <= now) buckets.delete(bucketKey);
    }
    nextCleanupAt = now + windowMs;
  }

  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  const allowed = bucket.count < limit;
  if (allowed) bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ message: "Too many authentication attempts" });
    return;
  }

  next();
}
