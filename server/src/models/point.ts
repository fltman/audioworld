import type { AudioPoint } from '@audioworld/shared';
import { pool } from '../db/pool';
import { pointInputToColumns, rowToPoint, type PointRow } from '../lib/mapping';

/** Mark the parent course as edited, so any point change (incl. deletion — which
 *  leaves no signal on a surviving row) shows up as "unpublished changes". */
async function touchCourse(courseId: string): Promise<void> {
  await pool.query('UPDATE courses SET updated_at = now() WHERE id = $1', [courseId]);
}

export async function listByCourse(courseId: string): Promise<AudioPoint[]> {
  // Bounded: a course far past any sane point count won't return an unbounded payload.
  const { rows } = await pool.query<PointRow>(
    'SELECT * FROM audio_points WHERE course_id = $1 ORDER BY created_at ASC LIMIT 5000',
    [courseId]
  );
  return rows.map(rowToPoint);
}

export async function get(id: string): Promise<AudioPoint | null> {
  const { rows } = await pool.query<PointRow>(
    'SELECT * FROM audio_points WHERE id = $1',
    [id]
  );
  return rows[0] ? rowToPoint(rows[0]) : null;
}

/** Create a point; `courseId` from the route always wins over any body value. */
export async function create(courseId: string, input: unknown): Promise<AudioPoint> {
  const c = pointInputToColumns(input, courseId);
  const { rows } = await pool.query<PointRow>(
    `INSERT INTO audio_points
       (course_id, name, type, audio_kind, audio_url, audio_title,
        audio_description, audio_tags, volume, playback, config, sync, start_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      c.course_id,
      c.name,
      c.type,
      c.audio_kind,
      c.audio_url,
      c.audio_title,
      c.audio_description,
      c.audio_tags,
      c.volume,
      JSON.stringify(c.playback),
      JSON.stringify(c.config),
      c.sync,
      c.start_at,
    ]
  );
  await touchCourse(c.course_id);
  return rowToPoint(rows[0]!);
}

export async function update(id: string, input: unknown): Promise<AudioPoint | null> {
  const existing = await get(id);
  if (!existing) return null;

  const c = pointInputToColumns(input, existing.courseId);
  const { rows } = await pool.query<PointRow>(
    `UPDATE audio_points SET
       name = $1, type = $2, audio_kind = $3, audio_url = $4, audio_title = $5,
       audio_description = $6, audio_tags = $7, volume = $8, playback = $9,
       config = $10, sync = $11, start_at = $12, updated_at = now()
     WHERE id = $13 RETURNING *`,
    [
      c.name,
      c.type,
      c.audio_kind,
      c.audio_url,
      c.audio_title,
      c.audio_description,
      c.audio_tags,
      c.volume,
      JSON.stringify(c.playback),
      JSON.stringify(c.config),
      c.sync,
      c.start_at,
      id,
    ]
  );
  if (rows[0]) await touchCourse(existing.courseId);
  return rows[0] ? rowToPoint(rows[0]) : null;
}

export async function remove(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ course_id: string }>(
    'DELETE FROM audio_points WHERE id = $1 RETURNING course_id',
    [id]
  );
  if (rows[0]) await touchCourse(rows[0].course_id);
  return rows.length > 0;
}
