import type { AudioPoint, Character, Course } from '@audioworld/shared';

/**
 * A compact fingerprint of a course as the assistant last saw it: each point's and
 * guide's name + last edit, and a hash per course field. Comparing it with the course
 * now tells the assistant what the author changed in the editor between its replies.
 */
export interface CourseFingerprint {
  points: Record<string, [name: string, updatedAt: string]>;
  guides: Record<string, [name: string, updatedAt: string]>;
  course: Record<string, string>;
}

/** Course fields worth reporting, with how to name them to the model. */
const COURSE_FIELDS: Array<[keyof Course, string]> = [
  ['name', 'the name'],
  ['description', 'the start-page description'],
  ['idea', 'the idea notes'],
  ['backgroundInfo', 'the background notes'],
  ['imageUrl', 'the cover image'],
  ['route', 'the planned route'],
  ['zones', 'the acoustic zones'],
  ['showStartWayfinding', 'start wayfinding'],
  ['eyesUp', 'eyes-up mode'],
];

/** A short, stable hash of any JSON-able value (djb2 over its JSON). */
function hash(v: unknown): string {
  const s = JSON.stringify(v ?? null);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

export function fingerprint(course: Course, points: AudioPoint[], guides: Character[]): CourseFingerprint {
  return {
    points: Object.fromEntries(points.map((p) => [p.id, [p.name, p.updatedAt]])),
    guides: Object.fromEntries(guides.map((g) => [g.id, [g.name, g.updatedAt]])),
    course: Object.fromEntries(COURSE_FIELDS.map(([k]) => [k, hash(course[k])])),
  };
}

const quoteList = (names: string[], max = 12): string => {
  const shown = names.slice(0, max).map((n) => `“${n}”`);
  return names.length > max ? `${shown.join(', ')} and ${names.length - max} more` : shown.join(', ');
};

/** What changed between two fingerprints, as a note for the model — or null if nothing. */
export function describeChanges(before: CourseFingerprint, now: CourseFingerprint): string | null {
  const lines: string[] = [];
  const diff = (a: CourseFingerprint['points'], b: CourseFingerprint['points']) => ({
    added: Object.keys(b).filter((id) => !a[id]).map((id) => b[id]![0]),
    removed: Object.keys(a).filter((id) => !b[id]).map((id) => a[id]![0]),
    edited: Object.keys(b).filter((id) => a[id] && a[id]![1] !== b[id]![1]).map((id) => b[id]![0]),
  });
  const p = diff(before.points, now.points);
  if (p.edited.length) lines.push(`- Edited points: ${quoteList(p.edited)}`);
  if (p.added.length) lines.push(`- New points: ${quoteList(p.added)}`);
  if (p.removed.length) lines.push(`- Deleted points: ${quoteList(p.removed)}`);
  const changedFields = COURSE_FIELDS.filter(([k]) => before.course[k] !== undefined && before.course[k] !== now.course[k]).map(
    ([, label]) => label
  );
  if (changedFields.length) lines.push(`- Changed ${changedFields.join(', ')}`);
  const g = diff(before.guides, now.guides);
  if (g.edited.length) lines.push(`- Edited guides: ${quoteList(g.edited)}`);
  if (g.added.length) lines.push(`- New guides: ${quoteList(g.added)}`);
  if (g.removed.length) lines.push(`- Deleted guides: ${quoteList(g.removed)}`);
  if (lines.length === 0) return null;
  return (
    '[Since your last reply the author changed the course in the editor. The course state in the system ' +
    'prompt already includes these changes and is what is true now — trust it over anything said earlier ' +
    'in this conversation:\n' +
    `${lines.join('\n')}]`
  );
}
