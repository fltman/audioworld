import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { requireRole, type AuthedRequest } from '../lib/auth';
import { OpenRouterError, describeClip, enhancePersona, openrouterConfigured } from '../lib/openrouter';

export const enhanceRouter = Router();

// Authoring-only and rate-limited: each call spends real OpenRouter credits.
enhanceRouter.use(requireRole('superuser', 'admin'));
const byUser = (req: import('express').Request): string =>
  (req as AuthedRequest).user?.id ?? req.ip ?? 'anon';
enhanceRouter.use(rateLimit({ windowMs: 60_000, max: 20, key: byUser }));
const dailyPaidLimit = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 400, key: byUser });

enhanceRouter.post(
  '/persona',
  dailyPaidLimit,
  asyncHandler(async (req, res) => {
    if (!openrouterConfigured()) {
      throw new OpenRouterError('AI enhance is not configured (no OpenRouter API key).', 503);
    }
    const b = (req.body ?? {}) as { name?: unknown; persona?: unknown };
    const name = typeof b.name === 'string' ? b.name : '';
    const seed = typeof b.persona === 'string' ? b.persona : '';
    const persona = await enhancePersona({ name, seed });
    res.json({ success: true, data: { persona } });
  })
);

enhanceRouter.post(
  '/clip',
  dailyPaidLimit,
  asyncHandler(async (req, res) => {
    if (!openrouterConfigured()) {
      throw new OpenRouterError('AI enhance is not configured (no OpenRouter API key).', 503);
    }
    const url = (req.body as { url?: unknown })?.url;
    if (typeof url !== 'string') throw new OpenRouterError('A clip "url" is required', 400);
    const description = await describeClip(url);
    res.json({ success: true, data: { description } });
  })
);

enhanceRouter.use(
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
