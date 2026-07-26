import type { Character, CharacterInput } from '@audioworld/shared';
import { pool } from '../db/pool';

interface CharacterRow {
  id: string;
  name: string;
  persona: string;
  voice_id: string;
  voice_name: string | null;
  idle_sound_url: string | null;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowTo(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    voiceId: row.voice_id,
    voiceName: row.voice_name ?? undefined,
    idleSoundUrl: row.idle_sound_url ?? undefined,
    ownerId: row.owner_id ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Admins see all characters; everyone else sees only their own. */
export async function listCharacters(userId: string, isAdmin: boolean): Promise<Character[]> {
  const { rows } = isAdmin
    ? await pool.query<CharacterRow>('SELECT * FROM characters ORDER BY name ASC LIMIT 500')
    : await pool.query<CharacterRow>(
        'SELECT * FROM characters WHERE owner_id = $1 ORDER BY name ASC LIMIT 500',
        [userId]
      );
  return rows.map(rowTo);
}

export async function getCharacter(id: string): Promise<Character | null> {
  const { rows } = await pool.query<CharacterRow>('SELECT * FROM characters WHERE id = $1', [id]);
  return rows[0] ? rowTo(rows[0]) : null;
}

export async function createCharacter(input: CharacterInput, ownerId: string): Promise<Character> {
  const { rows } = await pool.query<CharacterRow>(
    `INSERT INTO characters (name, persona, voice_id, voice_name, idle_sound_url, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.name,
      input.persona ?? '',
      input.voiceId ?? '',
      input.voiceName ?? null,
      input.idleSoundUrl ?? null,
      ownerId,
    ]
  );
  return rowTo(rows[0]!);
}

export async function updateCharacter(id: string, input: CharacterInput): Promise<Character | null> {
  const { rows } = await pool.query<CharacterRow>(
    `UPDATE characters
       SET name = $1, persona = $2, voice_id = $3, voice_name = $4, idle_sound_url = $5,
           updated_at = now()
     WHERE id = $6 RETURNING *`,
    [
      input.name,
      input.persona ?? '',
      input.voiceId ?? '',
      input.voiceName ?? null,
      input.idleSoundUrl ?? null,
      id,
    ]
  );
  return rows[0] ? rowTo(rows[0]) : null;
}

export async function removeCharacter(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM characters WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
