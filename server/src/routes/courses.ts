import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type {
  AcousticZone,
  CourseInput,
  PublishedCourse,
  PublishedSnapshot,
  ReverbCharacter,
} from '@audioworld/shared';
import { flightCheck } from '@audioworld/shared';
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
  // Undefined (field omitted) means "leave unchanged" on update — updateCourse
  // COALESCEs it — so a partial PUT can't silently wipe description/flag.
  return {
    name: b.name,
    description: typeof b.description === 'string' ? b.description : undefined,
    showStartWayfinding:
      typeof b.showStartWayfinding === 'boolean' ? b.showStartWayfinding : undefined,
    zones: parseZones(b.zones),
  };
}

const REVERB_CHARS: readonly ReverbCharacter[] = [
  'room',
  'hall',
  'cathedral',
  'tunnel',
  'outdoor',
];
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Validate acoustic zones. Undefined (omitted) means "leave unchanged" on update. */
function parseZones(value: unknown): AcousticZone[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ValidationError('"zones" must be an array');
  return value.map((z, i) => {
    if (!z || typeof z !== 'object') throw new ValidationError(`zones[${i}] must be an object`);
    const o = z as Record<string, unknown>;
    if (!Array.isArray(o.polygon) || o.polygon.length < 3) {
      throw new ValidationError(`zones[${i}].polygon needs at least 3 points`);
    }
    const polygon = o.polygon.map((c, j) => {
      const cc = c as Record<string, unknown>;
      if (!cc || typeof cc.lat !== 'number' || typeof cc.lng !== 'number') {
        throw new ValidationError(`zones[${i}].polygon[${j}] must be {lat, lng}`);
      }
      return { lat: cc.lat, lng: cc.lng };
    });
    const zone: AcousticZone = {
      id: typeof o.id === 'string' && o.id ? o.id : randomUUID(),
      name: typeof o.name === 'string' && o.name.trim() ? o.name : `Zone ${i + 1}`,
      polygon,
      reverb: REVERB_CHARS.includes(o.reverb as ReverbCharacter)
        ? (o.reverb as ReverbCharacter)
        : 'room',
      wet: typeof o.wet === 'number' ? clamp01(o.wet) : 0.5,
    };
    if (typeof o.ambienceUrl === 'string' && o.ambienceUrl.trim()) zone.ambienceUrl = o.ambienceUrl;
    if (typeof o.ambienceVolume === 'number') zone.ambienceVolume = clamp01(o.ambienceVolume);
    return zone;
  });
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
    if (!data) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
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

// Freeze the current draft as the published version (blocked on flight-check errors).
coursesRouter.post(
  '/:id/publish',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const course = await loadManageable(req, res);
    if (!course) return;
    const points = await Points.listByCourse(course.id);
    const issues = flightCheck(points, course.zones);
    if (issues.some((i) => i.severity === 'error')) {
      res.status(422).json({
        success: false,
        error: 'Fix the flight-check errors before publishing.',
        data: issues,
      });
      return;
    }
    const snapshot: PublishedSnapshot = {
      name: course.name,
      description: course.description,
      showStartWayfinding: course.showStartWayfinding,
      zones: course.zones,
      points,
      publishedAt: new Date().toISOString(),
    };
    res.json({ success: true, data: await Courses.publish(course.id, snapshot) });
  })
);

// Public: the frozen published snapshot a listener plays (falls back to the live
// draft if the course was never published, so a link always plays something).
coursesRouter.get(
  '/:id/published',
  asyncHandler(async (req, res) => {
    const course = await Courses.getCourse(req.params.id);
    if (!course) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    const snap = await Courses.getPublished(req.params.id);
    const data: PublishedCourse = snap
      ? {
          course: {
            ...course,
            name: snap.name,
            description: snap.description,
            showStartWayfinding: snap.showStartWayfinding,
            zones: snap.zones,
          },
          points: snap.points,
          published: true,
        }
      : { course, points: await Points.listByCourse(req.params.id), published: false };
    res.json({ success: true, data });
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
