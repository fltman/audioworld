import { Router } from 'express';
import type { Credentials } from '@audioworld/shared';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { rateLimit } from '../lib/rateLimit';
import {
  hashPassword,
  requireAuth,
  signToken,
  verifyPassword,
  type AuthedRequest,
} from '../lib/auth';
import * as Users from '../models/user';

export const authRouter = Router();

// Throttle the credential endpoints: caps online password guessing and the bcrypt CPU
// cost (and unbounded account creation) an attacker can force. Keyed on client IP.
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function readCreds(body: unknown, requireStrong: boolean): Credentials {
  const b = (body ?? {}) as Record<string, unknown>;
  // Normalize the email to lowercase so a case variant can't create a second account
  // or shadow login/admin-bootstrap (lookups are case-insensitive; writes must match).
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!email || !email.includes('@')) throw new ValidationError('A valid email is required');
  if (!password) throw new ValidationError('A password is required');
  if (requireStrong && password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  return { email, password };
}

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = readCreds(req.body, true);
    if (await Users.findByEmailWithHash(email)) {
      throw new ValidationError('An account with that email already exists');
    }
    // New sign-ups start as 'basic' (no authoring privileges until an admin promotes them).
    const user = await Users.createUser(email, await hashPassword(password), 'basic');
    res.status(201).json({ success: true, data: { token: signToken(user), user } });
  })
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = readCreds(req.body, false);
    const row = await Users.findByEmailWithHash(email);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }
    const user = Users.toUser(row);
    res.json({ success: true, data: { token: signToken(user), user } });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await Users.findById(req.user!.id);
    if (!user) {
      res.status(401).json({ success: false, error: 'Account not found' });
      return;
    }
    res.json({ success: true, data: user });
  })
);
