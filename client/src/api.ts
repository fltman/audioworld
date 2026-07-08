import type { ApiResponse, AudioPoint, Course } from '@audioworld/shared';

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

/** Server-relative audio paths (`/uploads/...`) become absolute against the API host. */
export function absoluteAudioUrl(url: string): string {
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}
