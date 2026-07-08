import { Router } from 'express';
import type { CourseInput } from '@audioworld/shared';
import * as Courses from '../models/course';
import * as Points from '../models/point';
import { ValidationError } from '../lib/mapping';
import { asyncHandler } from '../lib/http';

export const coursesRouter = Router();

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
  asyncHandler(async (req, res) => {
    const data = await Courses.createCourse(validateCourseInput(req.body));
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
  asyncHandler(async (req, res) => {
    const data = await Courses.updateCourse(req.params.id, validateCourseInput(req.body));
    if (!data) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    res.json({ success: true, data });
  })
);

coursesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = await Courses.removeCourse(req.params.id);
    if (!removed) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
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
  asyncHandler(async (req, res) => {
    const course = await Courses.getCourse(req.params.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    const data = await Points.create(req.params.courseId, req.body);
    res.status(201).json({ success: true, data });
  })
);
