import type { ClipKind } from '@audioworld/shared';
import { pool } from '../db/pool';

export interface UploadMeta {
  description?: string;
  kind?: ClipKind;
}

/** Metadata (description + kind) for the given filenames, keyed by filename. */
export async function metaFor(filenames: string[]): Promise<Map<string, UploadMeta>> {
  const map = new Map<string, UploadMeta>();
  if (filenames.length === 0) return map;
  const { rows } = await pool.query<{
    filename: string;
    description: string | null;
    kind: string | null;
  }>('SELECT filename, description, kind FROM uploads WHERE filename = ANY($1)', [filenames]);
  for (const r of rows) {
    const meta: UploadMeta = {};
    if (r.description) meta.description = r.description;
    if (r.kind === 'sfx' || r.kind === 'voice') meta.kind = r.kind;
    if (meta.description || meta.kind) map.set(r.filename, meta);
  }
  return map;
}

/** Set (or clear, with '') the description for a clip, preserving its kind. Upserts. */
export async function setDescription(filename: string, description: string): Promise<void> {
  await pool.query(
    `INSERT INTO uploads (filename, description) VALUES ($1, $2)
     ON CONFLICT (filename) DO UPDATE SET description = EXCLUDED.description`,
    [filename, description || null]
  );
}

/** Set both description and kind (used by generation + AI clip naming). Upserts. */
export async function setMeta(
  filename: string,
  description: string,
  kind: ClipKind | null
): Promise<void> {
  await pool.query(
    `INSERT INTO uploads (filename, description, kind) VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET description = EXCLUDED.description, kind = EXCLUDED.kind`,
    [filename, description || null, kind]
  );
}

/** Delete a clip's metadata row (the on-disk file is removed by the route). */
export async function deleteMeta(filename: string): Promise<void> {
  await pool.query('DELETE FROM uploads WHERE filename = $1', [filename]);
}

/** All `/uploads/...` urls a point references: main audio + path-stop clips + variants. */
function pointClipUrls(audioUrl: string | null, config: Record<string, unknown>): Set<string> {
  const urls = new Set<string>();
  if (typeof audioUrl === 'string' && audioUrl.startsWith('/uploads/')) urls.add(audioUrl);
  const stops = config.stops;
  if (Array.isArray(stops)) {
    for (const s of stops) {
      const u = (s as { audio?: { url?: unknown } })?.audio?.url;
      if (typeof u === 'string' && u.startsWith('/uploads/')) urls.add(u);
    }
  }
  const variants = config.audioVariants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      const u = (v as { url?: unknown })?.url;
      if (typeof u === 'string' && u.startsWith('/uploads/')) urls.add(u);
    }
  }
  return urls;
}

/** How many points reference each clip url (each point counted once per distinct clip). */
export async function clipUsageCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { rows } = await pool.query<{ audio_url: string | null; config: Record<string, unknown> }>(
    'SELECT audio_url, config FROM audio_points'
  );
  for (const r of rows) {
    for (const u of pointClipUrls(r.audio_url, r.config ?? {})) {
      counts.set(u, (counts.get(u) ?? 0) + 1);
    }
  }
  return counts;
}

/** Rewrite every reference to clip `from` → `to` across points (main audio, stops,
 *  variants), guide idle sounds and zone ambience. Returns the number of points changed. */
export async function replaceClipUrl(from: string, to: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: pts } = await client.query<{
      id: string;
      audio_url: string | null;
      config: Record<string, unknown>;
    }>('SELECT id, audio_url, config FROM audio_points');
    let changed = 0;
    for (const p of pts) {
      let touched = false;
      let audioUrl = p.audio_url;
      if (audioUrl === from) {
        audioUrl = to;
        touched = true;
      }
      const config = p.config ?? {};
      const stops = config.stops;
      if (Array.isArray(stops)) {
        for (const s of stops) {
          const a = (s as { audio?: { url?: unknown } })?.audio;
          if (a && a.url === from) {
            (a as { url: string }).url = to;
            touched = true;
          }
        }
      }
      const variants = config.audioVariants;
      if (Array.isArray(variants)) {
        for (const v of variants) {
          if ((v as { url?: unknown })?.url === from) {
            (v as { url: string }).url = to;
            touched = true;
          }
        }
      }
      if (touched) {
        await client.query(
          'UPDATE audio_points SET audio_url = $1, config = $2, updated_at = now() WHERE id = $3',
          [audioUrl, JSON.stringify(config), p.id]
        );
        changed++;
      }
    }

    await client.query(
      'UPDATE characters SET idle_sound_url = $1, updated_at = now() WHERE idle_sound_url = $2',
      [to, from]
    );

    const { rows: courses } = await client.query<{ id: string; zones: unknown }>(
      'SELECT id, zones FROM courses'
    );
    for (const c of courses) {
      if (!Array.isArray(c.zones)) continue;
      let z = false;
      for (const zone of c.zones) {
        if ((zone as { ambienceUrl?: unknown })?.ambienceUrl === from) {
          (zone as { ambienceUrl: string }).ambienceUrl = to;
          z = true;
        }
      }
      if (z) {
        await client.query('UPDATE courses SET zones = $1, updated_at = now() WHERE id = $2', [
          JSON.stringify(c.zones),
          c.id,
        ]);
      }
    }

    await client.query('COMMIT');
    return changed;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
