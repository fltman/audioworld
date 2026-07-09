import type {
  AcousticZone,
  AnalyticsReport,
  Course,
  CourseAnalytics,
  CourseInput,
  PublishedSnapshot,
} from '@audioworld/shared';
import { pool } from '../db/pool';

const emptyAnalytics = (): CourseAnalytics => ({ cells: {}, reached: {}, sessions: 0 });

/** The aggregate analytics for a course (never individual tracks). */
export async function getAnalytics(id: string): Promise<CourseAnalytics> {
  const { rows } = await pool.query<{ analytics: CourseAnalytics | null }>(
    'SELECT analytics FROM courses WHERE id = $1',
    [id]
  );
  return rows[0]?.analytics ?? emptyAnalytics();
}

/** Fold one anonymous session report into the running aggregate. */
export async function mergeAnalytics(id: string, report: AnalyticsReport): Promise<void> {
  const agg = await getAnalytics(id);
  for (const [cell, secs] of Object.entries(report.cells)) {
    agg.cells[cell] = (agg.cells[cell] ?? 0) + secs;
  }
  for (const pid of report.reached) {
    agg.reached[pid] = (agg.reached[pid] ?? 0) + 1;
  }
  agg.sessions += 1;
  await pool.query('UPDATE courses SET analytics = $1 WHERE id = $2', [JSON.stringify(agg), id]);
}

interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  show_start_wayfinding: boolean;
  eyes_up: boolean;
  zones: AcousticZone[] | null;
  published: PublishedSnapshot | null;
  created_at: Date;
  updated_at: Date;
}

function rowToCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    ownerId: row.owner_id ?? null,
    showStartWayfinding: row.show_start_wayfinding,
    eyesUp: row.eyes_up,
    zones: row.zones ?? [],
    publishedAt: row.published?.publishedAt ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Freeze a playable snapshot as the published version. */
export async function publish(id: string, snapshot: PublishedSnapshot): Promise<Course | null> {
  // Publishing is not a content edit — leave updated_at alone so a freshly published
  // course reads as "no unpublished changes" (publishedAt >= updatedAt).
  const { rows } = await pool.query<CourseRow>(
    'UPDATE courses SET published = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(snapshot), id]
  );
  return rows[0] ? rowToCourse(rows[0]) : null;
}

/** A course + its published snapshot (if any) in a single query — the hot listener read. */
export async function getWithSnapshot(
  id: string
): Promise<{ course: Course; snapshot: PublishedSnapshot | null } | null> {
  const { rows } = await pool.query<CourseRow>('SELECT * FROM courses WHERE id = $1', [id]);
  return rows[0] ? { course: rowToCourse(rows[0]), snapshot: rows[0].published ?? null } : null;
}

export async function listCourses(): Promise<Course[]> {
  const { rows } = await pool.query<CourseRow>(
    'SELECT * FROM courses ORDER BY created_at ASC'
  );
  return rows.map(rowToCourse);
}

export async function getCourse(id: string): Promise<Course | null> {
  const { rows } = await pool.query<CourseRow>(
    'SELECT * FROM courses WHERE id = $1',
    [id]
  );
  return rows[0] ? rowToCourse(rows[0]) : null;
}

export async function createCourse(
  input: CourseInput,
  ownerId: string | null = null
): Promise<Course> {
  const { rows } = await pool.query<CourseRow>(
    `INSERT INTO courses (name, description, owner_id, show_start_wayfinding, eyes_up, zones)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.name,
      input.description ?? null,
      ownerId,
      input.showStartWayfinding ?? false,
      input.eyesUp ?? false,
      JSON.stringify(input.zones ?? []),
    ]
  );
  return rowToCourse(rows[0]!);
}

export async function updateCourse(
  id: string,
  input: CourseInput
): Promise<Course | null> {
  // COALESCE: a null param (field omitted in the input) keeps the stored value, so a
  // partial update never wipes description/flag. An explicit "" / false still applies.
  const { rows } = await pool.query<CourseRow>(
    `UPDATE courses SET
       name = $1,
       description = COALESCE($2, description),
       show_start_wayfinding = COALESCE($3, show_start_wayfinding),
       eyes_up = COALESCE($4, eyes_up),
       zones = COALESCE($5, zones),
       updated_at = now()
     WHERE id = $6 RETURNING *`,
    [
      input.name,
      input.description ?? null,
      input.showStartWayfinding ?? null,
      input.eyesUp ?? null,
      input.zones != null ? JSON.stringify(input.zones) : null,
      id,
    ]
  );
  return rows[0] ? rowToCourse(rows[0]) : null;
}

export async function removeCourse(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
