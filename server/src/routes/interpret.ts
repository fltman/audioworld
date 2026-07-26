import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { rateLimit } from '../lib/rateLimit';
import { requireRole, type AuthedRequest } from '../lib/auth';
import { OpenRouterError, interpretPoi, openrouterConfigured } from '../lib/openrouter';

export const interpretRouter = Router();

// Authoring-only and rate-limited: each call spends real OpenRouter credits, so it must
// not be a cheap way to burn the account. Limits key on the authenticated USER (not IP)
// so a leaked token can't be amplified across many IPs; plus a per-user daily cap.
interpretRouter.use(requireRole('superuser', 'admin'));
const byUser = (req: import('express').Request): string =>
  (req as AuthedRequest).user?.id ?? req.ip ?? 'anon';
interpretRouter.use(rateLimit({ windowMs: 60_000, max: 20, key: byUser }));
const dailyPaidLimit = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 400, key: byUser });

const MAX_NOTE = 4000;
const MAX_PHOTOS = 8;

interpretRouter.post(
  '/',
  dailyPaidLimit,
  asyncHandler(async (req, res) => {
    if (!openrouterConfigured()) {
      throw new OpenRouterError('AI interpretation is not configured (no OpenRouter API key).', 503);
    }
    const b = (req.body ?? {}) as { note?: unknown; photos?: unknown };
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, MAX_NOTE) : '';
    const photos = Array.isArray(b.photos)
      ? b.photos
          .filter((p): p is string => typeof p === 'string' && p.startsWith('/uploads/'))
          .slice(0, MAX_PHOTOS)
      : [];
    if (!note && photos.length === 0) {
      throw new ValidationError('Provide a note and/or photos to interpret');
    }
    const data = await interpretPoi({ note, photos });
    res.json({ success: true, data });
  })
);

interpretRouter.use(
  (
    err: unknown,
    _req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) => {
    if (err instanceof OpenRouterError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
);
