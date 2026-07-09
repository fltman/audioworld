import type { RunSnapshot } from './experience';

// A saved run older than this isn't offered for resume (you've moved on).
const FRESH_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * localStorage key for a course's run state. Includes publishedAt so republishing a
 * course invalidates in-flight runs against the old version (their point ids / flags
 * may no longer line up).
 */
export function runKey(courseId: string, publishedAt: string | null | undefined): string {
  return `aw-run:${courseId}:${publishedAt ?? 'draft'}`;
}

/** A resumable snapshot for this key, if a fresh one with real progress exists. */
export function readResumable(key: string): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RunSnapshot;
    if (!snap || snap.v !== 1 || typeof snap.savedAt !== 'number') return null;
    if (Date.now() - snap.savedAt > FRESH_MS) {
      localStorage.removeItem(key);
      return null;
    }
    // Only worth offering if the walk actually got somewhere.
    const progressed =
      (snap.flags?.length ?? 0) > 0 ||
      (snap.reached?.length ?? 0) > 0 ||
      Object.values(snap.state ?? {}).some((s) => s.triggeredAtSec != null);
    return progressed ? snap : null;
  } catch {
    return null;
  }
}

export function clearRun(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
