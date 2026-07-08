import type {
  ApiResponse,
  AudioPoint,
  AudioPointInput,
  Course,
  CourseInput,
  UploadResult,
} from '@audioworld/shared';

export const BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
).replace(/\/$/, '');

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

/** Perform a request and unwrap the ApiResponse envelope, throwing on failure. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`Invalid response from server (${res.status}).`);
  }
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? `Request failed (${res.status}).`);
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
  listCourses: () => request<Course[]>('/api/courses'),
  getCourse: (id: string) => request<Course>(`/api/courses/${id}`),
  createCourse: (input: CourseInput) =>
    request<Course>('/api/courses', jsonBody('POST', input)),
  updateCourse: (id: string, input: CourseInput) =>
    request<Course>(`/api/courses/${id}`, jsonBody('PUT', input)),
  deleteCourse: (id: string) =>
    request<{ id: string }>(`/api/courses/${id}`, { method: 'DELETE' }),

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
};
