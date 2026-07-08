import { Router } from 'express';
import type { CourseInput } from '@audioworld/shared';
import * as Courses from '../models/course';
import * as Points from '../models/point';
import { ValidationError } from '../lib/mapping';
import { asyncHandler } from '../lib/http';
import { canManageCourse, requireRole, type AuthedRequest } from '../lib/auth';

export const coursesRouter = Router();

/** Load a course and ensure the caller may manage it (owner or admin), else 403/404. */
async function loadManageable(req: AuthedRequest, res: import('express').Response) {
  const course = await Courses.getCourse(req.params.courseId ?? req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return null;
  }
  if (!canManageCourse(req.user, course.ownerId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this course' });
    return null;
  }
  return course;
}

function validateCourseInput(body: unknown): CourseInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Body must be an object');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new ValidationError('Course "name" is required');
  }
  return {
    name: b.name,
    description: typeof b.description === 'string' ? b.description : undefined,
  };
}

coursesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const data = await Courses.listCourses();
    res.json({ success: true, data });
  })
);

coursesRouter.post(
  '/',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await Courses.createCourse(validateCourseInput(req.body), req.user!.id);
    res.status(201).json({ success: true, data });
  })
);

coursesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await Courses.getCourse(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    res.json({ success: true, data });
  })
);

coursesRouter.put(
  '/:id',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Courses.updateCourse(req.params.id, validateCourseInput(req.body));
    res.json({ success: true, data });
  })
);

coursesRouter.delete(
  '/:id',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    await Courses.removeCourse(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  })
);

coursesRouter.get(
  '/:courseId/points',
  asyncHandler(async (req, res) => {
    const course = await Courses.getCourse(req.params.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    const data = await Points.listByCourse(req.params.courseId);
    res.json({ success: true, data });
  })
);

coursesRouter.post(
  '/:courseId/points',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Points.create(req.params.courseId, req.body);
    res.status(201).json({ success: true, data });
  })
);
