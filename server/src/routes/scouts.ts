import { Router } from 'express';
import type { ScoutWaypointInput } from '@audioworld/shared';
import * as Scouts from '../models/scout';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { canManageCourse, requireRole, type AuthedRequest } from '../lib/auth';

export const scoutsRouter = Router();

// Scouting is an authoring activity — same roles as course authoring.
scoutsRouter.use(requireRole('superuser', 'admin'));

/** Load a scout set and ensure the caller owns it (or is admin), else 403/404. */
async function loadManageable(req: AuthedRequest, res: import('express').Response) {
  const set = await Scouts.getScout(req.params.id);
  if (!set) {
    res.status(404).json({ success: false, error: 'Scout set not found' });
    return null;
  }
  if (!canManageCourse(req.user, set.ownerId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this scout set' });
    return null;
  }
  return set;
}

function requireName(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new ValidationError('A "name" is required');
  }
  return b.name.trim().slice(0, 120);
}

/** Validate + sanitize a waypoint from an untrusted client. */
function parseWaypoint(body: unknown): ScoutWaypointInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const lat = b.lat;
  const lng = b.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new ValidationError('Waypoint needs finite lat/lng in range');
  }
  const out: ScoutWaypointInput = { lat, lng };
  if (typeof b.note === 'string' && b.note.trim()) out.note = b.note.trim().slice(0, 2000);
  if (typeof b.audioUrl === 'string' && b.audioUrl.startsWith('/uploads/')) {
    out.audioUrl = b.audioUrl.slice(0, 200);
  }
  if (typeof b.accuracy === 'number' && Number.isFinite(b.accuracy)) {
    out.accuracy = Math.max(0, Math.min(10000, b.accuracy));
  }
  return out;
}

scoutsRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await Scouts.listScouts(req.user!.id, req.user!.role === 'admin');
    res.json({ success: true, data });
  })
);

scoutsRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await Scouts.createScout(requireName(req.body), req.user!.id);
    res.status(201).json({ success: true, data });
  })
);

scoutsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const set = await loadManageable(req, res);
    if (set) res.json({ success: true, data: set });
  })
);

scoutsRouter.put(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Scouts.renameScout(req.params.id, requireName(req.body));
    res.json({ success: true, data });
  })
);

scoutsRouter.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    await Scouts.removeScout(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  })
);

scoutsRouter.post(
  '/:id/waypoints',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Scouts.addWaypoint(
      req.params.id,
      parseWaypoint(req.body),
      new Date().toISOString()
    );
    res.status(201).json({ success: true, data });
  })
);

scoutsRouter.delete(
  '/:id/waypoints/:wpId',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Scouts.removeWaypoint(req.params.id, req.params.wpId);
    res.json({ success: true, data });
  })
);
