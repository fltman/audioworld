import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config();

/** HTTP port the API listens on. */
export const PORT = Number(process.env.PORT ?? 3001);

/** Postgres connection string. */
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://audioworld:audioworld@localhost:5433/audioworld';

/** Absolute directory where uploaded/synthesized audio lives and is served from.
 *  `||` (not `??`) so an empty UPLOAD_DIR= doesn't resolve to cwd and expose it. */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads');

/** Allowed CORS origin ('*' for any). */
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'dev-insecure-secret-change-me';

/**
 * Secret for signing/verifying JWTs. In production it MUST be provided (and be a real
 * secret): the repo is public, so a hardcoded default would let anyone forge admin
 * tokens. We fail fast rather than silently booting on a world-readable default.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (IS_PROD) {
    if (!secret || secret === DEV_SECRET || secret.length < 16) {
      throw new Error(
        '[env] JWT_SECRET must be set to a strong random value (>=16 chars) in production. ' +
          'Generate one with `openssl rand -base64 48` and set it in the environment.'
      );
    }
    return secret;
  }
  if (!secret) {
    console.warn('[env] JWT_SECRET not set — using an insecure dev default (dev only).');
    return DEV_SECRET;
  }
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();
