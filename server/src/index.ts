import { existsSync, mkdirSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { CORS_ORIGIN, PORT, UPLOAD_DIR } from './env';
import { applySchema } from './db/pool';
import { coursesRouter } from './routes/courses';
import { pointsRouter } from './routes/points';
import { uploadRouter } from './routes/upload';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { attachUser } from './lib/auth';
import { errorHandler } from './lib/http';

async function main(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  await applySchema();

  const app = express();
  // Behind Caddy (one hop): trust it so req.ip is the real client IP, which the
  // rate limiters key on. Without this every client shares Caddy's IP → one bucket.
  app.set('trust proxy', 1);
  // Baseline security headers on every API/asset response (the SPA HTML is served by
  // Caddy). nosniff in particular stops a served upload from being MIME-sniffed as HTML.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(cors({ origin: CORS_ORIGIN }));
  app.use(express.json());
  app.use(attachUser); // populates req.user from a Bearer token when present

  // Raw health check (not wrapped in the ApiResponse envelope).
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Server clock, for the client's time-sync handshake (global/shared points).
  app.get('/api/time', (_req, res) => {
    res.json({ now: Date.now() });
  });

  // Serve uploaded/synthesized audio: CORS-enabled, HTTP range requests supported.
  // Defense-in-depth against a malicious upload being rendered inline (the stored
  // extension is already forced to a safe audio type): force download semantics and a
  // locked-down CSP so even if the Content-Type were wrong the bytes can't run as a page.
  app.use(
    '/uploads',
    cors({ origin: CORS_ORIGIN }),
    express.static(UPLOAD_DIR, {
      acceptRanges: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/points', pointsRouter);
  app.use('/api/upload', uploadRouter);

  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`AudioWorld server listening on http://localhost:${PORT}`);
    console.log(`  Health:  http://localhost:${PORT}/api/health`);
    console.log(`  API:     http://localhost:${PORT}/api/courses`);
    console.log(`  Uploads: http://localhost:${PORT}/uploads/`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
