import type {
  AssistantChat,
  AssistantChatSummary,
  AssistantEvent,
  AssistantMessage,
  AssistantRequest,
  CreateVoiceRequest,
} from '@audioworld/shared';
import { ApiError, BASE, getToken } from '../api';

/**
 * Send the conversation to the course's AI assistant and feed each streamed event to
 * `onEvent` until the reply is done. Rejects on a refused request; an abort just stops.
 */
export async function streamAssistant(
  courseId: string,
  req: AssistantRequest,
  onEvent: (e: AssistantEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}/api/assistant/${courseId}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `The assistant failed (${res.status}).`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new ApiError(msg, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue; // ": ping" keep-alives
        try {
          onEvent(JSON.parse(line.slice(5)) as AssistantEvent);
        } catch {
          /* a malformed event is skipped, not fatal */
        }
      }
    }
  }
}

/** A JSON call to the assistant API (ApiResponse envelope), authorised as the author. */
async function call<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (payload !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}/api/assistant${path}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string };
  if (!res.ok || !body.success || body.data === undefined) {
    throw new ApiError(body.error ?? `The assistant request failed (${res.status}).`, res.status);
  }
  return body.data;
}

/** Keep a designed voice preview (and give it to a guide). */
export const createVoice = (req: CreateVoiceRequest) =>
  call<{ voiceId: string; name: string; guideId: string | null }>('/voices', 'POST', req);

/** The author's saved chats about a course, most recent first. */
export const listChats = (courseId: string) => call<AssistantChatSummary[]>(`/${courseId}/chats`);
export const getChat = (id: string) => call<AssistantChat>(`/chats/${id}`);
export const deleteChat = (id: string) => call<{ id: string }>(`/chats/${id}`, 'DELETE');
/** Save a conversation held elsewhere (the browser) as a chat. */
export const importChat = (courseId: string, chat: { messages: AssistantMessage[]; personaId: string | null }) =>
  call<AssistantChat>(`/${courseId}/chats`, 'POST', chat);
