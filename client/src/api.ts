import type {
  AnalyticsReport,
  ApiResponse,
  AudioPoint,
  AuthResult,
  Course,
  PublishedCourse,
  ScoutSet,
  ScoutWaypointInput,
  UploadResult,
  User,
} from '@audioworld/shared';

/** REST base. Overridable via VITE_API_URL; falls back to the dev server port. */
export const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001').replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || json.data === undefined) {
    throw new Error(json.error || `Request failed (${res.status}): ${path}`);
  }
  return json.data;
}

// --- Author auth (only the scouting flow needs it; listening stays anonymous) ---

const SCOUT_TOKEN_KEY = 'audioworld.scout.token';
let scoutToken: string | null = localStorage.getItem(SCOUT_TOKEN_KEY);

export function getScoutToken(): string | null {
  return scoutToken;
}
export function setScoutToken(token: string | null): void {
  scoutToken = token;
  if (token) localStorage.setItem(SCOUT_TOKEN_KEY, token);
  else localStorage.removeItem(SCOUT_TOKEN_KEY);
}

/** Thrown on an authed request failure, carrying the status (401 ⇒ re-login). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (scoutToken) headers.set('Authorization', `Bearer ${scoutToken}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  if (!json.success || json.data === undefined) {
    throw new ApiError(json.error || `Request failed (${res.status})`, res.status);
  }
  return json.data;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function scoutLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_URL}/api/auth/login`, jsonBody('POST', { email, password }));
  const json = (await res.json()) as ApiResponse<AuthResult>;
  if (!json.success || !json.data) throw new ApiError(json.error || 'Login failed', res.status);
  setScoutToken(json.data.token);
  return json.data;
}
export const scoutMe = () => authed<User>('/api/auth/me');

export const listScouts = () => authed<ScoutSet[]>('/api/scouts');
export const createScout = (name: string) => authed<ScoutSet>('/api/scouts', jsonBody('POST', { name }));
export const getScout = (id: string) => authed<ScoutSet>(`/api/scouts/${id}`);
export const deleteScout = (id: string) =>
  authed<{ id: string }>(`/api/scouts/${id}`, { method: 'DELETE' });
export const addWaypoint = (id: string, wp: ScoutWaypointInput) =>
  authed<ScoutSet>(`/api/scouts/${id}/waypoints`, jsonBody('POST', wp));
export const deleteWaypoint = (id: string, wpId: string) =>
  authed<ScoutSet>(`/api/scouts/${id}/waypoints/${wpId}`, { method: 'DELETE' });

/** Upload a recorded voice note (author-authenticated). */
export function uploadVoiceNote(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  return authed<UploadResult>('/api/upload', { method: 'POST', body: form });
}

export const getCourses = () => get<Course[]>('/api/courses');
export const getCourse = (id: string) => get<Course>(`/api/courses/${id}`);
export const getPoints = (courseId: string) =>
  get<AudioPoint[]>(`/api/courses/${courseId}/points`);
/** The frozen published version a listener plays (falls back to the draft if never published). */
export const getPublished = (id: string) => get<PublishedCourse>(`/api/courses/${id}/published`);

/** Post one anonymous, aggregate session report (fire-and-forget, survives page close). */
export function postAnalytics(id: string, report: AnalyticsReport): void {
  try {
    void fetch(`${API_URL}/api/courses/${id}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore — analytics is best-effort */
  }
}

/** Server-relative audio paths (`/uploads/...`) become absolute against the API host. */
export function absoluteAudioUrl(url: string): string {
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}

/**
 * Estimate the offset (ms) to add to this device's clock to match the server's,
 * so global/shared points are clocked identically on every device. Takes a few
 * samples and keeps the one with the lowest round-trip for the tightest estimate.
 * Returns 0 if the endpoint is unavailable (falls back to the device clock).
 */
export async function syncServerTime(samples = 3): Promise<number> {
  let best: { offset: number; rtt: number } | null = null;
  for (let i = 0; i < samples; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${API_URL}/api/time`);
      const { now } = (await res.json()) as { now: number };
      const t1 = Date.now();
      const rtt = t1 - t0;
      // Assume symmetric latency: server time at t1 ≈ now + rtt/2.
      const offset = now + rtt / 2 - t1;
      if (!best || rtt < best.rtt) best = { offset, rtt };
    } catch {
      /* ignore; try the next sample */
    }
  }
  return best ? best.offset : 0;
}
