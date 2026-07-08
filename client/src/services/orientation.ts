export type CompassStatus = 'ok' | 'unavailable' | 'denied';

export interface OrientationWatch {
  stop(): void;
}

type PermissionResult = 'granted' | 'denied' | 'default' | 'unsupported';

interface AbsoluteOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

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
 * Track absolute compass heading (0..360, clockwise from north) or report that no
 * compass is available. iOS delivers `webkitCompassHeading` (already clockwise from
 * magnetic north); Android/Chrome delivers absolute `alpha` (counter-clockwise, so
 * heading = 360 - alpha).
 */
export function watchHeading(
  onHeading: (deg: number) => void,
  onStatus: (status: CompassStatus) => void
): OrientationWatch {
  let received = false;

  const handle = (event: DeviceOrientationEvent) => {
    const e = event as AbsoluteOrientationEvent;
    let heading: number | null = null;

    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading;
    } else if ((e.absolute || event.type === 'deviceorientationabsolute') && e.alpha != null) {
      heading = (360 - e.alpha) % 360;
    }

    if (heading != null) {
      received = true;
      onHeading((heading + 360) % 360);
      onStatus('ok');
    }
  };

  const hasAbsolute = 'ondeviceorientationabsolute' in window;
  const primary = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(primary, handle as EventListener);
  // iOS emits webkitCompassHeading on the plain event; keep both when they differ.
  if (hasAbsolute) window.addEventListener('deviceorientation', handle as EventListener);

  // If nothing arrives shortly, the device has no (usable) compass.
  const probe = window.setTimeout(() => {
    if (!received) onStatus('unavailable');
  }, 2500);

  return {
    stop() {
      clearTimeout(probe);
      window.removeEventListener(primary, handle as EventListener);
      if (hasAbsolute) window.removeEventListener('deviceorientation', handle as EventListener);
    },
  };
}
