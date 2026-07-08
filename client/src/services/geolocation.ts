import type { Coordinates } from '@audioworld/shared';

export interface PositionFix {
  coords: Coordinates;
  /** Horizontal accuracy in meters (as reported by the device). */
  accuracy: number;
}

export interface GeoWatch {
  stop(): void;
}

/**
 * Geolocation and DeviceOrientation are only exposed on secure origins. `localhost`
 * and `127.0.0.1` count as secure even over http, which is what dev uses.
 */
export function isSecureEnough(): boolean {
  const host = location.hostname;
  return (
    window.isSecureContext ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'
  );
}

/** Human-readable message for a GeolocationPositionError. */
export function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied';
    case err.POSITION_UNAVAILABLE:
      return 'Position unavailable';
    case err.TIMEOUT:
      return 'Location timed out';
    default:
      return 'Location error';
  }
}

/** Continuously track the user with high accuracy and no cached fixes. */
export function watchUserPosition(
  onFix: (fix: PositionFix) => void,
  onError: (err: GeolocationPositionError) => void
): GeoWatch {
  if (!('geolocation' in navigator)) {
    onError({
      code: 2,
      message: 'Geolocation unsupported',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    return { stop() {} };
  }

  const id = navigator.geolocation.watchPosition(
    (p) =>
      onFix({
        coords: { lat: p.coords.latitude, lng: p.coords.longitude },
        accuracy: p.coords.accuracy,
      }),
    onError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
  );

  return { stop: () => navigator.geolocation.clearWatch(id) };
}
