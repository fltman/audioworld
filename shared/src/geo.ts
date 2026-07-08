import type { Coordinates } from './types';

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Great-circle distance between two coordinates, in meters (Haversine). */
export function calculateDistance(a: Coordinates, b: Coordinates): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const Δφ = (b.lat - a.lat) * DEG;
  const Δλ = (b.lng - a.lng) * DEG;

  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Initial bearing (azimuth) from `from` to `to`, in degrees clockwise from north (0..360).
 */
export function calculateBearing(from: Coordinates, to: Coordinates): number {
  const φ1 = from.lat * DEG;
  const φ2 = to.lat * DEG;
  const Δλ = (to.lng - from.lng) * DEG;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/**
 * Point reached by travelling `distanceM` meters from `from` along `bearingDeg`
 * (clockwise from north). Used to place orbiting / offset sources.
 */
export function destinationPoint(
  from: Coordinates,
  bearingDeg: number,
  distanceM: number
): Coordinates {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = bearingDeg * DEG;
  const φ1 = from.lat * DEG;
  const λ1 = from.lng * DEG;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return {
    lat: φ2 * RAD,
    lng: (((λ2 * RAD + 540) % 360) - 180),
  };
}

/**
 * Signed angular difference `target - reference`, normalized to (-180, 180].
 * Positive = target is clockwise (to the right) of the reference heading.
 */
export function relativeBearing(targetDeg: number, referenceDeg: number): number {
  let d = (targetDeg - referenceDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Distance-based attenuation curve. Returns a gain multiplier 0..maxVolume.
 * Silent at/after `radius`; smooth inverse-square-ish falloff toward the source.
 */
export function attenuation(distance: number, radius: number, maxVolume: number): number {
  if (radius <= 0) return 0;
  if (distance >= radius) return 0;
  if (distance <= 0) return maxVolume;
  const t = distance / radius; // 0..1
  return maxVolume * (1 - t * t);
}
