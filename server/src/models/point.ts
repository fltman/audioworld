import type { AudioPoint } from '@audioworld/shared';
import { pool } from '../db/pool';
import { pointInputToColumns, rowToPoint, type PointRow } from '../lib/mapping';

export async function listByCourse(courseId: string): Promise<AudioPoint[]> {
  const { rows } = await pool.query<PointRow>(
    'SELECT * FROM audio_points WHERE course_id = $1 ORDER BY created_at ASC',
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
        audio_description, audio_tags, volume, playback, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    ]
  );
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
       config = $10, updated_at = now()
     WHERE id = $11 RETURNING *`,
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
      id,
    ]
  );
  return rows[0] ? rowToPoint(rows[0]) : null;
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM audio_points WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
