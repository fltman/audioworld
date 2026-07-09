import type {
  ApiResponse,
  AudioPoint,
  AudioPointInput,
  AuthResult,
  Course,
  CourseInput,
  Role,
  UploadListItem,
  UploadResult,
  User,
} from '@audioworld/shared';

export const BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
).replace(/\/$/, '');

const TOKEN_KEY = 'audioworld.admin.token';
let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken(): string | null {
  return authToken;
}

/** Server-relative audio paths (`/uploads/...`) become absolute against the API host. */
export function absoluteAudioUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

/** Offset (ms) to add to Date.now() to match the server clock (for global points). */
export async function syncServerTime(samples = 3): Promise<number> {
  let best: { offset: number; rtt: number } | null = null;
  for (let i = 0; i < samples; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${BASE}/api/time`);
      const { now } = (await res.json()) as { now: number };
      const t1 = Date.now();
      const rtt = t1 - t0;
      const offset = now + rtt / 2 - t1;
      if (!best || rtt < best.rtt) best = { offset, rtt };
    } catch {
      /* try next sample */
    }
  }
  return best ? best.offset : 0;
}

/** Thrown on HTTP error, carrying the status so callers can react to 401/403. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Perform a request (with the bearer token if present) and unwrap the envelope. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`Invalid response from server (${res.status}).`, res.status);
  }
  if (!body.success || body.data === undefined) {
    throw new ApiError(body.error ?? `Request failed (${res.status}).`, res.status);
  }
  return body.data;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const api = {
  register: (email: string, password: string) =>
    request<AuthResult>('/api/auth/register', jsonBody('POST', { email, password })),
  login: (email: string, password: string) =>
    request<AuthResult>('/api/auth/login', jsonBody('POST', { email, password })),
  me: () => request<User>('/api/auth/me'),

  listUsers: () => request<User[]>('/api/users'),
  setUserRole: (id: string, role: Role) =>
    request<User>(`/api/users/${id}/role`, jsonBody('PATCH', { role })),

  listCourses: () => request<Course[]>('/api/courses'),
  getCourse: (id: string) => request<Course>(`/api/courses/${id}`),
  createCourse: (input: CourseInput) =>
    request<Course>('/api/courses', jsonBody('POST', input)),
  updateCourse: (id: string, input: CourseInput) =>
    request<Course>(`/api/courses/${id}`, jsonBody('PUT', input)),
  deleteCourse: (id: string) =>
    request<{ id: string }>(`/api/courses/${id}`, { method: 'DELETE' }),
  publishCourse: (id: string) =>
    request<Course>(`/api/courses/${id}/publish`, { method: 'POST' }),

  listPoints: (courseId: string) =>
    request<AudioPoint[]>(`/api/courses/${courseId}/points`),
  createPoint: (courseId: string, input: AudioPointInput) =>
    request<AudioPoint>(`/api/courses/${courseId}/points`, jsonBody('POST', input)),
  updatePoint: (id: string, input: AudioPointInput) =>
    request<AudioPoint>(`/api/points/${id}`, jsonBody('PUT', input)),
  deletePoint: (id: string) =>
    request<{ id: string }>(`/api/points/${id}`, { method: 'DELETE' }),

  uploadAudio: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<UploadResult>('/api/upload', { method: 'POST', body: form });
  },
  listUploads: () => request<UploadListItem[]>('/api/upload'),
  setUploadDescription: (filename: string, description: string) =>
    request<{ filename: string; description: string }>(
      `/api/upload/${encodeURIComponent(filename)}`,
      jsonBody('PATCH', { description })
    ),
};
