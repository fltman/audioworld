import type { RequestHandler } from 'express';

interface RateOptions {
  /** Sliding window length in ms. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Optional key derivation (defaults to client IP). */
  key?: (ip: string) => string;
}

/**
 * A tiny in-memory, per-key rate limiter for a single-instance deployment. Keys on the
 * client IP by default — relies on `app.set('trust proxy', …)` so `req.ip` is the real
 * client behind Caddy, not the proxy. Returns 429 when the window budget is exceeded.
 */
export function rateLimit({ windowMs, max, key }: RateOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    // Opportunistically prune expired entries so the map can't grow without bound.
    if (hits.size > 5000) {
      for (const [k, e] of hits) if (now > e.resetAt) hits.delete(k);
    }
    const id = key ? key(req.ip ?? 'unknown') : (req.ip ?? 'unknown');
    const e = hits.get(id);
    if (!e || now > e.resetAt) {
      hits.set(id, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    e.count += 1;
    if (e.count > max) {
      res.status(429).json({ success: false, error: 'Too many requests — please slow down.' });
      return;
    }
    next();
  };
}
