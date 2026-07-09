export type CompassStatus = 'ok' | 'gps' | 'unavailable' | 'denied';

/** Which input produced the current heading. */
export type HeadingSource = 'compass' | 'fused' | 'gps' | 'none';

export interface HeadingWatch {
  stop(): void;
  /** Feed a GPS course-over-ground sample (deg CW from north, m/s) to anchor fused heading. */
  feedGps(course: number | null, speed: number | null): void;
  /** Best current heading (deg CW from north) + which source produced it; deg null if unknown. */
  current(): { deg: number | null; source: HeadingSource };
}

type PermissionResult = 'granted' | 'denied' | 'default' | 'unsupported';

interface AbsoluteOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

/** Course over ground is only trustworthy while actually walking. */
const GPS_ANCHOR_MIN_SPEED = 1.0; // m/s

/** A magnetic reading older than this is treated as cold — yield to the GPS fallback. */
const COMPASS_STALE_MS = 2000;

const norm = (deg: number): number => ((deg % 360) + 360) % 360;
/** Signed smallest rotation from a to b, in [-180, 180). */
const shortestDelta = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

/**
 * iOS 13+ gates DeviceOrientation behind an explicit permission that MUST be
 * requested from inside a user gesture. Elsewhere it resolves to 'unsupported'
 * and listeners can simply be attached.
 */
export async function requestOrientationPermission(): Promise<PermissionResult> {
  const Evt = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  } | undefined;
  if (Evt && typeof Evt.requestPermission === 'function') {
    try {
      return await Evt.requestPermission();
    } catch {
      return 'denied';
    }
  }
  return 'unsupported';
}

/**
 * Fused heading. Prefers the absolute magnetic compass (iOS webkitCompassHeading or
 * Android absolute alpha). When no compass is available — a large slice of Android and
 * all desktops — it falls back to the GPS course over ground (only reliable while
 * walking), and between GPS fixes it carries relative device-orientation rotation so
 * turning on the spot still moves the soundfield. Without either it reports 'none' and
 * the caller holds the last heading.
 *
 * `alpha` (relative or absolute) is converted to a pseudo-heading (360 - alpha) — the
 * same convention as the compass — so the rotation delta added to the GPS anchor has
 * the correct sign by construction.
 */
export function watchHeading(): HeadingWatch {
  let compassHeading: number | null = null;
  let compassAt = 0; // perf timestamp of the last absolute reading (staleness guard)
  let alpha: number | null = null; // latest device alpha (relative or absolute)
  let anchorGps: number | null = null; // absolute heading anchor from GPS course
  let anchorRel: number | null = null; // pseudo-heading (360 - alpha) captured at the anchor

  const handle = (event: DeviceOrientationEvent) => {
    const e = event as AbsoluteOrientationEvent;
    let abs: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      abs = norm(e.webkitCompassHeading);
    } else if ((e.absolute || event.type === 'deviceorientationabsolute') && e.alpha != null) {
      abs = norm(360 - e.alpha);
    }
    if (abs != null) {
      compassHeading = abs;
      compassAt = performance.now();
    }
    if (e.alpha != null) alpha = e.alpha;
  };

  const hasAbsolute = 'ondeviceorientationabsolute' in window;
  const primary = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(primary, handle as EventListener);
  if (hasAbsolute) window.addEventListener('deviceorientation', handle as EventListener);

  return {
    stop() {
      window.removeEventListener(primary, handle as EventListener);
      if (hasAbsolute) window.removeEventListener('deviceorientation', handle as EventListener);
    },
    feedGps(course, speed) {
      if (
        course != null &&
        !Number.isNaN(course) &&
        course >= 0 &&
        speed != null &&
        speed > GPS_ANCHOR_MIN_SPEED
      ) {
        anchorGps = norm(course);
        // Re-anchor the relative frame to this course, if we have an orientation sensor.
        anchorRel = alpha != null ? norm(360 - alpha) : null;
      }
    },
    current() {
      // A live magnetic compass wins. If it goes cold (magnetometer lost its fix) but
      // GPS/relative rotation are still fresh, fall through to the fallback instead of
      // freezing on the last bearing.
      const compassLive =
        compassHeading != null && performance.now() - compassAt < COMPASS_STALE_MS;
      if (compassLive) {
        return { deg: compassHeading, source: 'compass' };
      }
      if (anchorGps != null && anchorRel != null && alpha != null) {
        const relNow = norm(360 - alpha);
        return { deg: norm(anchorGps + shortestDelta(anchorRel, relNow)), source: 'fused' };
      }
      if (anchorGps != null) {
        return { deg: anchorGps, source: 'gps' };
      }
      // No live fallback — a stale compass reading still beats nothing.
      if (compassHeading != null) {
        return { deg: compassHeading, source: 'compass' };
      }
      return { deg: null, source: 'none' };
    },
  };
}
