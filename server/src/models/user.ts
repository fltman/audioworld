import type { Role, User } from '@audioworld/shared';
import { pool } from '../db/pool';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
}

export function toUser(r: UserRow): User {
  return { id: r.id, email: r.email, role: r.role, createdAt: r.created_at.toISOString() };
}

export async function createUser(
  email: string,
  passwordHash: string,
  role: Role = 'basic'
): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
    [email, passwordHash, role]
  );
  return toUser(rows[0]!);
}

export async function findByEmailWithHash(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT * FROM users WHERE lower(email) = lower($1)',
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
  return rows.map(toUser);
}

export async function setRole(id: string, role: Role): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
    [role, id]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** Create the user if the email is free, else update its password + role (bootstrap admin). */
export async function upsertUser(
  email: string,
  passwordHash: string,
  role: Role
): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
     RETURNING *`,
    [email, passwordHash, role]
  );
  return toUser(rows[0]!);
}
