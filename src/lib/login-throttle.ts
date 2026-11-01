import "server-only";

/**
 * Attempt limiting for the admin password, held in memory.
 *
 * In memory on purpose. The alternative is a table, and a table means a
 * migration — see the note in CLAUDE.md about two chats generating migrations
 * from different baselines. More to the point, this service runs as a single
 * instance on Render's free plan, so a module-level map *is* the whole fleet's
 * view, and an attacker hammering the form keeps the instance awake, so the
 * counts survive exactly as long as the attack does. A restart clears them,
 * which costs an attacker a deploy they cannot trigger.
 *
 * If this ever runs on more than one instance, this becomes per-instance and
 * the real limit becomes `MAX_ATTEMPTS × instances`. Move it to the database
 * then; don't assume it still holds.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

type Bucket = { count: number; firstAt: number };

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.firstAt > WINDOW_MS) buckets.delete(key);
  }
}

export type ThrottleState = { blocked: boolean; retryAfterMinutes: number };

export function checkThrottle(key: string): ThrottleState {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.count < MAX_ATTEMPTS) {
    return { blocked: false, retryAfterMinutes: 0 };
  }

  return {
    blocked: true,
    retryAfterMinutes: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.firstAt)) / 60_000)),
  };
}

export function recordFailure(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);

  // The window starts at the first failure and does not slide, so a steady
  // trickle of guesses cannot hold the window open indefinitely: after fifteen
  // minutes the bucket is dropped and the attacker is back to five attempts,
  // which is five per fifteen minutes however they space them.
  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now });
    return;
  }

  bucket.count += 1;
}

export function clearFailures(key: string) {
  buckets.delete(key);
}
