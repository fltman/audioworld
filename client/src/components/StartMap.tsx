import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { AudioPoint } from '@audioworld/shared';
import { anchorOf } from '@audioworld/shared';

function startIcon(): L.DivIcon {
  return L.divIcon({
    className: 'start-pin',
    html: '<span class="start-pin__label">Start</span><span class="start-pin__dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * A glanceable map on the gate that pins the course's start point — the first point
 * of the course, or the first vertex if that point is a path — so the listener knows
 * where to physically go before pressing start. Remaining points show as faint dots.
 */
export function StartMap({ points }: { points: AudioPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current || points.length === 0) return;
    const start = anchorOf(points[0]!);
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
    }).setView([start.lat, start.lng], 16);
    mapRef.current = map;

    // Subdomain-less host so URLs match exactly what an offline pack precaches.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Remaining points as faint context dots (the start pin sits on top).
    for (let i = 1; i < points.length; i++) {
      const a = anchorOf(points[i]!);
      L.circleMarker([a.lat, a.lng], {
        radius: 4,
        color: '#7c5cff',
        weight: 1,
        opacity: 0.5,
        fillOpacity: 0.3,
        interactive: false,
      }).addTo(map);
    }
    L.marker([start.lat, start.lng], { icon: startIcon(), interactive: false }).addTo(map);

    // A container that mounts inside an animating/centred card can mis-measure its
    // size; re-fix once it has settled so tiles fill the box.
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  return <div className="start-map" ref={containerRef} aria-label="Course start location" />;
}
