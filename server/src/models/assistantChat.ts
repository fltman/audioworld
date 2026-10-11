import type { AssistantChat, AssistantChatSummary, AssistantMessage } from '@audioworld/shared';
import { pool } from '../db/pool';
import type { CourseFingerprint } from '../lib/courseChanges';

interface ChatRow {
  id: string;
  course_id: string;
  user_id: string;
  title: string;
  persona_id: string | null;
  messages: AssistantMessage[] | null;
  seen: CourseFingerprint | null;
  created_at: Date;
  updated_at: Date;
}

/** A stored chat plus what the server needs (owner, course, fingerprint). */
export interface StoredChat extends AssistantChat {
  courseId: string;
  userId: string;
  seen: CourseFingerprint | null;
}

const summary = (r: ChatRow): AssistantChatSummary => ({
  id: r.id,
  title: r.title,
  updatedAt: r.updated_at.toISOString(),
  messageCount: (r.messages ?? []).filter((m) => m.role === 'user').length,
});

const stored = (r: ChatRow): StoredChat => ({
  ...summary(r),
  courseId: r.course_id,
  userId: r.user_id,
  messages: r.messages ?? [],
  personaId: r.persona_id,
  seen: r.seen,
});

/** An author's chats about a course, most recent first. */
export async function listChats(courseId: string, userId: string): Promise<AssistantChatSummary[]> {
  const { rows } = await pool.query<ChatRow>(
    `SELECT * FROM assistant_chats WHERE course_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 200`,
    [courseId, userId]
  );
  return rows.map(summary);
}

export async function getChat(id: string): Promise<StoredChat | null> {
  const { rows } = await pool.query<ChatRow>('SELECT * FROM assistant_chats WHERE id = $1', [id]);
  return rows[0] ? stored(rows[0]) : null;
}

export async function createChat(input: {
  courseId: string;
  userId: string;
  title: string;
  messages: AssistantMessage[];
  personaId: string | null;
}): Promise<StoredChat> {
  const { rows } = await pool.query<ChatRow>(
    `INSERT INTO assistant_chats (course_id, user_id, title, messages, persona_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.courseId, input.userId, input.title, JSON.stringify(input.messages), input.personaId]
  );
  return stored(rows[0]!);
}

/** Replace a chat's messages (and persona / fingerprint when given). */
export async function saveChat(
  id: string,
  patch: { messages: AssistantMessage[]; personaId?: string | null; seen?: CourseFingerprint }
): Promise<AssistantChatSummary | null> {
  const { rows } = await pool.query<ChatRow>(
    `UPDATE assistant_chats SET
       messages = $2,
       persona_id = CASE WHEN $3::boolean THEN $4 ELSE persona_id END,
       seen = COALESCE($5, seen),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      JSON.stringify(patch.messages),
      patch.personaId !== undefined,
      patch.personaId ?? null,
      patch.seen ? JSON.stringify(patch.seen) : null,
    ]
  );
  return rows[0] ? summary(rows[0]) : null;
}

export async function removeChat(id: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM assistant_chats WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** A chat's title from its first message: the opening words, on one line. */
export function titleFrom(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || 'New chat';
}
