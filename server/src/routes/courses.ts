import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type {
  AcousticZone,
  AnalyticsReport,
  CourseBundle,
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
import { buildBundle, extForAsset, rewritePointUrls, rewriteZoneUrls } from '../lib/bundle';
import { UPLOAD_DIR } from '../env';
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
    eyesUp: typeof b.eyesUp === 'boolean' ? b.eyesUp : undefined,
    zones: parseZones(b.zones),
  };
}

/** A cell key must be a real "lat,lng" grid coordinate — not an arbitrary string, so
 *  the aggregate's key space is bounded by geography, not attacker choice. */
function isCellKey(k: string): boolean {
  if (k.length > 24) return false;
  const c = k.indexOf(',');
  if (c <= 0) return false;
  const lat = Number(k.slice(0, c));
  const lng = Number(k.slice(c + 1));
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Sanitize + cap an anonymous analytics report from an untrusted client. */
function parseAnalyticsReport(body: unknown): AnalyticsReport {
  const b = (body ?? {}) as Record<string, unknown>;
  const cells: Record<string, number> = {};
  if (b.cells && typeof b.cells === 'object' && !Array.isArray(b.cells)) {
    let n = 0;
    for (const [k, v] of Object.entries(b.cells as Record<string, unknown>)) {
      if (n++ >= 4000) break;
      const secs = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(3600, v)) : 0;
      if (secs > 0 && typeof k === 'string' && isCellKey(k)) cells[k] = secs;
    }
  }
  const reached: string[] = [];
  if (Array.isArray(b.reached)) {
    for (const p of b.reached.slice(0, 1000)) {
      // Reject prototype-polluting keys — these become object keys in the aggregate.
      if (typeof p === 'string' && p.length > 0 && p.length <= 64 && !DANGEROUS_KEYS.has(p)) {
        reached.push(p);
      }
    }
  }
  return { cells, reached };
}

// Lightweight in-memory rate limit for the public analytics POST (single instance).
const analyticsHits = new Map<string, { count: number; resetAt: number }>();
function analyticsRateOk(ip: string): boolean {
  const now = Date.now();
  if (analyticsHits.size > 5000) {
    for (const [k, e] of analyticsHits) if (now > e.resetAt) analyticsHits.delete(k);
  }
  const e = analyticsHits.get(ip);
  if (!e || now > e.resetAt) {
    analyticsHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  e.count += 1;
  return e.count <= 30; // 30 posts / minute / IP
}

// A course bundle is uploaded as a file (multipart), so the base64-inlined audio
// isn't bound by express.json's small body limit. 60 MB of bundle ≈ 45 MB of audio.
const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const MAX_BUNDLE_POINTS = 500;
const MAX_BUNDLE_ASSETS = 500;
const MAX_ASSET_B64 = 34 * 1024 * 1024; // ~25 MB decoded

/** Parse + validate an uploaded .audioworld bundle from an untrusted file. */
function parseBundle(buf: Buffer): CourseBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new ValidationError('Not a valid .audioworld file');
  }
  if (!raw || typeof raw !== 'object') throw new ValidationError('Bundle must be an object');
  const b = raw as Record<string, unknown>;
  if (b.format !== 'audioworld-course' || b.version !== 1) {
    throw new ValidationError('Unsupported bundle format or version');
  }
  const courseIn = validateCourseInput(b.course); // reuses name/zones validation
  if (!Array.isArray(b.points) || b.points.length > MAX_BUNDLE_POINTS) {
    throw new ValidationError(`Bundle "points" must be an array of at most ${MAX_BUNDLE_POINTS}`);
  }
  if (!Array.isArray(b.assets) || b.assets.length > MAX_BUNDLE_ASSETS) {
    throw new ValidationError(`Bundle "assets" must be an array of at most ${MAX_BUNDLE_ASSETS}`);
  }
  for (const a of b.assets) {
    const o = a as Record<string, unknown>;
    if (
      typeof o?.url !== 'string' ||
      typeof o?.filename !== 'string' ||
      typeof o?.mime !== 'string' ||
      typeof o?.data !== 'string'
    ) {
      throw new ValidationError('Each asset needs string url, filename, mime and data');
    }
    if (o.data.length > MAX_ASSET_B64) throw new ValidationError('An audio asset is too large');
  }
  return {
    format: 'audioworld-course',
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
    course: courseIn,
    points: b.points as CourseBundle['points'],
    assets: b.assets as CourseBundle['assets'],
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

const MAX_ZONES = 200;
const MAX_ZONE_VERTICES = 1000;

/** Validate acoustic zones. Undefined (omitted) means "leave unchanged" on update. */
function parseZones(value: unknown): AcousticZone[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ValidationError('"zones" must be an array');
  if (value.length > MAX_ZONES) throw new ValidationError(`Too many zones (max ${MAX_ZONES})`);
  return value.map((z, i) => {
    if (!z || typeof z !== 'object') throw new ValidationError(`zones[${i}] must be an object`);
    const o = z as Record<string, unknown>;
    if (!Array.isArray(o.polygon) || o.polygon.length < 3) {
      throw new ValidationError(`zones[${i}].polygon needs at least 3 points`);
    }
    if (o.polygon.length > MAX_ZONE_VERTICES) {
      throw new ValidationError(`zones[${i}].polygon has too many vertices`);
    }
    const polygon = o.polygon.map((c, j) => {
      const cc = c as Record<string, unknown>;
      // Require FINITE lat/lng in range — NaN/Infinity would poison point-in-polygon math.
      if (
        !cc ||
        typeof cc.lat !== 'number' ||
        typeof cc.lng !== 'number' ||
        !Number.isFinite(cc.lat) ||
        !Number.isFinite(cc.lng) ||
        Math.abs(cc.lat) > 90 ||
        Math.abs(cc.lng) > 180
      ) {
        throw new ValidationError(`zones[${i}].polygon[${j}] must be finite {lat, lng} in range`);
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
      eyesUp: course.eyesUp,
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
    const found = await Courses.getWithSnapshot(req.params.id);
    if (!found) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    const { course, snapshot: snap } = found;
    const data: PublishedCourse = snap
      ? {
          course: {
            ...course,
            name: snap.name,
            description: snap.description,
            showStartWayfinding: snap.showStartWayfinding,
            eyesUp: snap.eyesUp,
            zones: snap.zones,
          },
          points: snap.points,
          published: true,
        }
      : { course, points: await Points.listByCourse(req.params.id), published: false };
    res.json({ success: true, data });
  })
);

// Public: fold one anonymous, aggregate-only session report into the running counts.
coursesRouter.post(
  '/:id/analytics',
  asyncHandler(async (req, res) => {
    if (!analyticsRateOk(req.ip ?? 'unknown')) {
      res.status(429).json({ success: false, error: 'Too many requests' });
      return;
    }
    await Courses.mergeAnalytics(req.params.id, parseAnalyticsReport(req.body));
    res.json({ success: true, data: { ok: true } });
  })
);

// Manage: the aggregate heatmap + funnel (no individual tracks exist).
coursesRouter.get(
  '/:id/analytics',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const course = await loadManageable(req, res);
    if (!course) return;
    res.json({ success: true, data: await Courses.getAnalytics(course.id) });
  })
);

// Export a course as a portable, self-contained .audioworld file (audio inlined).
coursesRouter.get(
  '/:id/export',
  requireRole('superuser', 'admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const course = await loadManageable(req, res);
    if (!course) return;
    const points = await Points.listByCourse(course.id);
    const bundle = buildBundle(course, points);
    const safe = (course.name || 'course').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'course';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.audioworld"`);
    res.send(JSON.stringify(bundle));
  })
);

// Import a .audioworld file as a brand-new course owned by the importer. Assets are
// written under fresh UUID names (bundle filenames are never used as paths) and every
// audio url is rewritten, so the restored course never depends on the source instance.
coursesRouter.post(
  '/import',
  requireRole('superuser', 'admin'),
  (req, res, next) => {
    bundleUpload.single('bundle')(req, res, (err: unknown) => {
      if (err) {
        res
          .status(400)
          .json({ success: false, error: err instanceof Error ? err.message : 'Upload failed' });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No bundle file (field "bundle")' });
      return;
    }
    const bundle = parseBundle(req.file.buffer);

    const urlMap = new Map<string, string>();
    const writtenFiles: string[] = [];
    for (const asset of bundle.assets) {
      const name = randomUUID() + extForAsset(asset);
      writeFileSync(join(UPLOAD_DIR, name), Buffer.from(asset.data, 'base64'));
      writtenFiles.push(name);
      urlMap.set(asset.url, `/uploads/${name}`);
    }

    // If any part fails mid-import, roll back so we don't leave a half-imported course
    // and orphaned asset files behind. (Point delete cascades from the course row.)
    let courseId: string | null = null;
    try {
      const zones = rewriteZoneUrls(bundle.course.zones ?? [], urlMap);
      const course = await Courses.createCourse({ ...bundle.course, zones }, req.user!.id);
      courseId = course.id;
      for (const point of bundle.points) {
        await Points.create(course.id, rewritePointUrls(point, urlMap));
      }
      res.status(201).json({ success: true, data: course });
    } catch (err) {
      if (courseId) await Courses.removeCourse(courseId).catch(() => {});
      for (const name of writtenFiles) {
        try {
          rmSync(join(UPLOAD_DIR, name), { force: true });
        } catch {
          /* best-effort cleanup */
        }
      }
      throw err;
    }
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
