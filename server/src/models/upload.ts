import { pool } from '../db/pool';

/** Descriptions for the given filenames, keyed by filename (missing/empty ones omitted). */
export async function descriptionsFor(filenames: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (filenames.length === 0) return map;
  const { rows } = await pool.query<{ filename: string; description: string | null }>(
    'SELECT filename, description FROM uploads WHERE filename = ANY($1)',
    [filenames]
  );
  for (const r of rows) if (r.description) map.set(r.filename, r.description);
  return map;
}

/** Set (or clear, with '') the description for a clip. Upserts by filename. */
export async function setDescription(filename: string, description: string): Promise<void> {
  await pool.query(
    `INSERT INTO uploads (filename, description) VALUES ($1, $2)
     ON CONFLICT (filename) DO UPDATE SET description = EXCLUDED.description`,
    [filename, description || null]
  );
}
