import type { Coordinates } from './types';

/**
 * The admin's AI assistant: the conversation format (OpenAI-style chat messages, as the
 * model sees them) and the events the server streams back while it works.
 */

export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AssistantMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface AssistantRequest {
  messages: AssistantMessage[];
  /** Speak as this guide (character id) for the whole reply; null/absent = the assistant. */
  personaId?: string | null;
}

/** Something the assistant shows on the author's map while it explains (numbered in order). */
export type MapAnnotation =
  /** A spot, e.g. a proposed position. */
  | { kind: 'mark'; at: Coordinates; label?: string }
  /** An existing point of the course. */
  | { kind: 'point'; id: string; label?: string }
  /** A line, e.g. a proposed path or a stretch of the route. */
  | { kind: 'line'; path: Coordinates[]; label?: string }
  /** A circular area. */
  | { kind: 'area'; at: Coordinates; radius: number; label?: string };

/** One of the candidate voices ElevenLabs designs from a description. */
export interface VoicePreview {
  generatedVoiceId: string;
  /** The sample as base64 audio (mediaType, usually audio/mpeg). */
  audioBase64: string;
  mediaType: string;
  durationSec: number;
}

/** Things the assistant changed, so the admin can reload them. */
export type AssistantChange = 'points' | 'guides' | 'course' | 'library';

export type AssistantEvent =
  /** Streamed reply text. */
  | { type: 'delta'; text: string }
  /** A tool ran (ok) or failed. `summary` is human-readable; `url` is a file it made
   *  (a voiced line, a sound effect, an image) for the chat to show. */
  | { type: 'tool'; id: string; name: string; summary: string; ok: boolean; url?: string }
  /** Voice previews to audition; the author picks one in the UI. */
  | {
      type: 'voice_previews';
      toolCallId: string;
      description: string;
      name: string;
      guideId?: string;
      previews: VoicePreview[];
    }
  | { type: 'changed'; what: AssistantChange[] }
  /** Show these on the author's map (replacing what was shown before). */
  | { type: 'map'; annotations: MapAnnotation[] }
  /** The turn is over: the messages it appended to the conversation. */
  | { type: 'done'; messages: AssistantMessage[] }
  | { type: 'error'; error: string };

/** Save one of the designed previews as a voice on the account (optionally a guide's). */
export interface CreateVoiceRequest {
  generatedVoiceId: string;
  name: string;
  description: string;
  guideId?: string;
}
