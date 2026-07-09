import type { AcousticZone, AudioPoint, FlightIssue } from './types';

/**
 * Pre-publish flight check: catches courses that are silently broken or unwinnable
 * before a listener (or a printed QR) ever hits them. Pure — the admin runs it live
 * and the server runs it on publish.
 */
export function flightCheck(points: AudioPoint[], zones?: AcousticZone[]): FlightIssue[] {
  const issues: FlightIssue[] = [];
  if (points.length === 0) {
    issues.push({ severity: 'warning', message: 'This course has no audio points yet.' });
  }

  // Flag reachability. A point is reachable only if every flag it requires can be
  // (transitively) raised by a reachable point. Grow the set of settable flags from
  // the unconditional points outward to a fixpoint; anything still required but never
  // settable makes its point unreachable — an unwinnable branch or a dead flag.
  const settable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of points) {
      const requires = p.requiresFlags ?? [];
      if (requires.every((f) => settable.has(f))) {
        for (const f of p.setsFlags ?? []) {
          if (!settable.has(f)) {
            settable.add(f);
            changed = true;
          }
        }
      }
    }
  }

  // Map each flag to its exclusive group (if any) so we can catch a point that
  // requires two mutually-exclusive flags — a crossroads only ever commits one.
  const groupOf = new Map<string, string>();
  for (const p of points) {
    if (p.flagGroup) for (const f of p.setsFlags ?? []) groupOf.set(f, p.flagGroup);
  }

  for (const p of points) {
    for (const f of p.requiresFlags ?? []) {
      if (!settable.has(f)) {
        issues.push({
          severity: 'error',
          message: `"${p.name}" requires flag "${f}", which no reachable point sets — it can never trigger.`,
          pointId: p.id,
        });
      }
    }
    // Two required flags from the same exclusive group can never both be raised.
    const byGroup = new Map<string, string[]>();
    for (const f of p.requiresFlags ?? []) {
      const g = groupOf.get(f);
      if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), f]);
    }
    for (const [, flags] of byGroup) {
      if (flags.length >= 2) {
        issues.push({
          severity: 'error',
          message: `"${p.name}" requires ${flags.map((f) => `"${f}"`).join(' and ')} from the same exclusive group — they can never both be set.`,
          pointId: p.id,
        });
      }
    }
    if (!p.audio?.url?.trim()) {
      issues.push({ severity: 'error', message: `"${p.name}" has no audio URL.`, pointId: p.id });
    }
    if ((p.type === 'path' || p.type === 'path_triggered') && p.path.length < 2) {
      issues.push({
        severity: 'error',
        message: `"${p.name}" is a path with fewer than 2 points.`,
        pointId: p.id,
      });
    }
    if ('stops' in p && p.stops) {
      for (const s of p.stops) {
        if (s.audio && !s.audio.url.trim()) {
          issues.push({
            severity: 'warning',
            message: `"${p.name}" stop #${s.index + 1} has an empty clip URL.`,
            pointId: p.id,
          });
        }
      }
    }
  }

  for (const z of zones ?? []) {
    if (z.polygon.length < 3) {
      issues.push({ severity: 'error', message: `Zone "${z.name}" needs at least 3 corners.` });
    }
  }
  return issues;
}
