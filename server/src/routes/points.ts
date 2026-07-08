import { Router } from 'express';
import type { Response } from 'express';
import * as Points from '../models/point';
import * as Courses from '../models/course';
import { asyncHandler } from '../lib/http';
import { canManageCourse, requireRole, type AuthedRequest } from '../lib/auth';

export const pointsRouter = Router();

/** Ensure the caller may manage the course that owns point :id, else 403/404. */
async function guardPoint(req: AuthedRequest, res: Response): Promise<boolean> {
  const point = await Points.get(req.params.id);
  if (!point) {
    res.status(404).json({ success: false, error: 'Point not found' });
    return false;
  }
  const course = await Courses.getCourse(point.courseId);
  if (!canManageCourse(req.user, course?.ownerId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this point' });
    return false;
  }
  return true;
}

pointsRouter.put(
  '/:id',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await guardPoint(req, res))) return;
    const data = await Points.update(req.params.id, req.body);
    res.json({ success: true, data });
  })
);

pointsRouter.delete(
  '/:id',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await guardPoint(req, res))) return;
    await Points.remove(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  })
);
