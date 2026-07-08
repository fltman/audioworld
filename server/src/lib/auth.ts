import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@audioworld/shared';
import { JWT_SECRET } from '../env';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: User): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: '30d',
  });
}

function readToken(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(header.slice(7), JWT_SECRET) as {
      sub: string;
      email: string;
      role: Role;
    };
    return { id: p.sub, email: p.email, role: p.role };
  } catch {
    return null;
  }
}

/** Attach req.user if a valid token is present. Never rejects (reads stay public). */
export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const u = readToken(req);
  if (u) req.user = u;
  next();
}

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, error: 'Authentication required' });
const forbidden = (res: Response) => res.status(403).json({ success: false, error: 'Forbidden' });

/** Require any logged-in user. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) return void unauthorized(res);
  next();
}

/** Require one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) return void unauthorized(res);
    if (!roles.includes(req.user.role)) return void forbidden(res);
    next();
  };
}

/** Admins manage any course; superusers only their own. */
export function canManageCourse(
  user: AuthUser | undefined,
  ownerId: string | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'superuser' && ownerId != null && ownerId === user.id;
}
