import type { AssistantEvent, AssistantRequest, CreateVoiceRequest } from '@audioworld/shared';
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

/** Keep a designed voice preview (and give it to a guide). */
export async function createVoice(req: CreateVoiceRequest): Promise<{ voiceId: string; name: string; guideId: string | null }> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}/api/assistant/voices`, { method: 'POST', headers, body: JSON.stringify(req) });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { voiceId: string; name: string; guideId: string | null }; error?: string };
  if (!res.ok || !body.success || !body.data) throw new ApiError(body.error ?? `Could not save the voice (${res.status}).`, res.status);
  return body.data;
}
