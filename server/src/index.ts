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
  app.use(
    '/uploads',
    cors({ origin: CORS_ORIGIN }),
    express.static(UPLOAD_DIR, { acceptRanges: true })
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
