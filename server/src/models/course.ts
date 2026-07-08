import type { Course, CourseInput } from '@audioworld/shared';
import { pool } from '../db/pool';

interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
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

export async function createCourse(input: CourseInput): Promise<Course> {
  const { rows } = await pool.query<CourseRow>(
    'INSERT INTO courses (name, description) VALUES ($1, $2) RETURNING *',
    [input.name, input.description ?? null]
  );
  return rowToCourse(rows[0]!);
}

export async function updateCourse(
  id: string,
  input: CourseInput
): Promise<Course | null> {
  const { rows } = await pool.query<CourseRow>(
    `UPDATE courses SET name = $1, description = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [input.name, input.description ?? null, id]
  );
  return rows[0] ? rowToCourse(rows[0]) : null;
}

export async function removeCourse(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
