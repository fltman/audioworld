import { Router } from 'express';
import type { BBox, PlaceCategory } from '@audioworld/shared';
import { PLACE_CATEGORIES } from '@audioworld/shared';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { rateLimit } from '../lib/rateLimit';
import { requireRole, type AuthedRequest } from '../lib/auth';
import { DiscoverError, discoverPlaces } from '../lib/overpass';

export const discoverRouter = Router();

// Authoring-only; rate-limited PER USER (not IP, so a leaked token can't be amplified
// across IPs) to stay polite to the shared public Overpass servers.
discoverRouter.use(requireRole('superuser', 'admin'));
const byUser = (req: import('express').Request): string =>
  (req as AuthedRequest).user?.id ?? req.ip ?? 'anon';
discoverRouter.use(rateLimit({ windowMs: 60_000, max: 12, key: byUser }));
discoverRouter.use(rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 400, key: byUser }));

const VALID_CATEGORIES = new Set<string>(PLACE_CATEGORIES.map((c) => c.key));
// Cap the search span (~0.25° ≈ 28 km N/S) so a query stays bounded + walkable.
const MAX_SPAN_DEG = 0.25;

function parseBBox(v: unknown): BBox {
  const b = (v ?? {}) as Record<string, unknown>;
  const nums = ['south', 'west', 'north', 'east'].map((k) => Number(b[k]));
  if (nums.some((n) => !Number.isFinite(n))) {
    throw new ValidationError('bbox needs finite south/west/north/east');
  }
  const [south, west, north, east] = nums as [number, number, number, number];
  if (north <= south || east <= west) throw new ValidationError('bbox is degenerate');
  if (Math.abs(north) > 90 || Math.abs(south) > 90 || Math.abs(east) > 180 || Math.abs(west) > 180) {
    throw new ValidationError('bbox is out of range');
  }
  if (north - south > MAX_SPAN_DEG || east - west > MAX_SPAN_DEG) {
    throw new ValidationError('Zoom in — the search area is too large.');
  }
  return { south, west, north, east };
}

function parseCategories(v: unknown): PlaceCategory[] {
  if (!Array.isArray(v)) throw new ValidationError('"categories" must be an array');
  const cats = v.filter((c): c is PlaceCategory => typeof c === 'string' && VALID_CATEGORIES.has(c));
  if (cats.length === 0) throw new ValidationError('Pick at least one place type');
  return [...new Set(cats)];
}

discoverRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as { bbox?: unknown; categories?: unknown };
    const bbox = parseBBox(body.bbox);
    const categories = parseCategories(body.categories);
    try {
      const places = await discoverPlaces(bbox, categories);
      res.json({ success: true, data: places });
    } catch (e) {
      if (e instanceof DiscoverError) {
        res.status(e.status).json({ success: false, error: e.message });
        return;
      }
      throw e;
    }
  })
);
