import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config();

/** HTTP port the API listens on. */
export const PORT = Number(process.env.PORT ?? 3001);

/** Postgres connection string. */
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://audioworld:audioworld@localhost:5433/audioworld';

/** Absolute directory where uploaded/synthesized audio lives and is served from. */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './uploads');

/** Allowed CORS origin ('*' for any). */
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
