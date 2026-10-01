/**
 * Small, dependency-free guards for public API routes.
 *
 * IMPORTANT: this state lives in the memory of one server instance. On Vercel, instances are
 * created and recycled freely and do not share memory, so these limits are best-effort. They stop
 * casual abuse and runaway loops; they are not a hard cap. The hard cap is the spend limit you set on
 * your Groq account. For shared, exact limits later, swap these functions for Upstash Redis or
 * Vercel KV; callers will not need to change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Fixed-window limiter. Returns ok=false and how many seconds to wait when the limit is hit. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    prune(now);
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Best guess at the caller's address behind a proxy. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

let budgetDay = "";
let budgetUsed = 0;

/** Counts one AI call against a per-day budget (UTC day). Returns false when the budget is spent. */
export function takeBudget(maxPerDay: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    budgetUsed = 0;
  }
  if (budgetUsed >= maxPerDay) return false;
  budgetUsed += 1;
  return true;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(
  key: string,
  value: unknown,
  ttlMs: number = 6 * 60 * 60 * 1000,
  maxEntries: number = 300
): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
