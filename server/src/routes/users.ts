import { Router } from 'express';
import type { Role } from '@audioworld/shared';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { requireRole } from '../lib/auth';
import * as Users from '../models/user';

export const usersRouter = Router();

// Everything here is admin-only.
usersRouter.use(requireRole('admin'));

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await Users.listUsers() });
  })
);

usersRouter.patch(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const role = (req.body as { role?: unknown } | null)?.role;
    if (role !== 'basic' && role !== 'superuser' && role !== 'admin') {
      throw new ValidationError('role must be "basic", "superuser" or "admin"');
    }
    const user = await Users.setRole(req.params.id, role as Role);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  })
);
