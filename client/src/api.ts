import type { ApiResponse, AudioPoint, Course, PublishedCourse } from '@audioworld/shared';

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

export const getCourses = () => get<Course[]>('/api/courses');
export const getCourse = (id: string) => get<Course>(`/api/courses/${id}`);
export const getPoints = (courseId: string) =>
  get<AudioPoint[]>(`/api/courses/${courseId}/points`);
/** The frozen published version a listener plays (falls back to the draft if never published). */
export const getPublished = (id: string) => get<PublishedCourse>(`/api/courses/${id}/published`);

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
