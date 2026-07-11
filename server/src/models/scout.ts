import { randomUUID } from 'node:crypto';
import type { ScoutSet, ScoutWaypoint, ScoutWaypointInput } from '@audioworld/shared';
import { pool } from '../db/pool';

interface ScoutRow {
  id: string;
  name: string;
  owner_id: string | null;
  waypoints: ScoutWaypoint[] | null;
  created_at: Date;
  updated_at: Date;
}

const MAX_WAYPOINTS = 2000;

function rowToSet(row: ScoutRow): ScoutSet {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id ?? null,
    waypoints: row.waypoints ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Admins see all scout sets; everyone else sees only their own. */
export async function listScouts(userId: string, isAdmin: boolean): Promise<ScoutSet[]> {
  const { rows } = isAdmin
    ? await pool.query<ScoutRow>('SELECT * FROM scouts ORDER BY updated_at DESC LIMIT 500')
    : await pool.query<ScoutRow>(
        'SELECT * FROM scouts WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 500',
        [userId]
      );
  return rows.map(rowToSet);
}

export async function getScout(id: string): Promise<ScoutSet | null> {
  const { rows } = await pool.query<ScoutRow>('SELECT * FROM scouts WHERE id = $1', [id]);
  return rows[0] ? rowToSet(rows[0]) : null;
}

export async function createScout(name: string, ownerId: string): Promise<ScoutSet> {
  const { rows } = await pool.query<ScoutRow>(
    'INSERT INTO scouts (name, owner_id) VALUES ($1, $2) RETURNING *',
    [name, ownerId]
  );
  return rowToSet(rows[0]!);
}

export async function renameScout(id: string, name: string): Promise<ScoutSet | null> {
  const { rows } = await pool.query<ScoutRow>(
    'UPDATE scouts SET name = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [name, id]
  );
  return rows[0] ? rowToSet(rows[0]) : null;
}

export async function removeScout(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM scouts WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** Append a waypoint atomically (under a row lock) so concurrent drops don't clobber. */
export async function addWaypoint(
  id: string,
  input: ScoutWaypointInput,
  now: string
): Promise<ScoutSet | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ScoutRow>(
      'SELECT * FROM scouts WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const waypoints = rows[0].waypoints ?? [];
    if (waypoints.length >= MAX_WAYPOINTS) {
      await client.query('ROLLBACK');
      return rowToSet(rows[0]);
    }
    const wp: ScoutWaypoint = { id: randomUUID(), createdAt: now, ...input };
    waypoints.push(wp);
    const { rows: updated } = await client.query<ScoutRow>(
      'UPDATE scouts SET waypoints = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [JSON.stringify(waypoints), id]
    );
    await client.query('COMMIT');
    return rowToSet(updated[0]!);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Remove a single waypoint from a set (row-locked read-modify-write). */
export async function removeWaypoint(id: string, wpId: string): Promise<ScoutSet | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ScoutRow>(
      'SELECT * FROM scouts WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const waypoints = (rows[0].waypoints ?? []).filter((w) => w.id !== wpId);
    const { rows: updated } = await client.query<ScoutRow>(
      'UPDATE scouts SET waypoints = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [JSON.stringify(waypoints), id]
    );
    await client.query('COMMIT');
    return rowToSet(updated[0]!);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
