import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coordinates, ScoutWaypoint } from '@audioworld/shared';

interface Props {
  center: Coordinates | null;
  accuracy: number | null;
  waypoints: ScoutWaypoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Live map for the scout editor: your position (+ accuracy) and the numbered waypoints. */
export function ScoutMap({ center, accuracy, waypoints, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const accCircle = useRef<L.Circle | null>(null);
  const wpLayer = useRef<L.LayerGroup | null>(null);
  const centeredOnce = useRef(false);
  const stateRef = useRef(onSelect);
  stateRef.current = onSelect;

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      attributionControl: false,
      fadeAnimation: false,
    }).setView([center?.lat ?? 59.3293, center?.lng ?? 18.0686], 17);
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    wpLayer.current = L.layerGroup().addTo(map);
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live position + accuracy ring; recentre only on the first fix (don't fight panning).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    if (!userMarker.current) {
      userMarker.current = L.circleMarker([center.lat, center.lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#7c5cff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      userMarker.current.setLatLng([center.lat, center.lng]);
    }
    if (accuracy != null) {
      if (!accCircle.current) {
        accCircle.current = L.circle([center.lat, center.lng], {
          radius: accuracy,
          color: '#7c5cff',
          weight: 1,
          opacity: 0.4,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
      } else {
        accCircle.current.setLatLng([center.lat, center.lng]);
        accCircle.current.setRadius(accuracy);
      }
    }
    if (!centeredOnce.current) {
      map.setView([center.lat, center.lng], 17);
      centeredOnce.current = true;
    }
  }, [center, accuracy]);

  useEffect(() => {
    const layer = wpLayer.current;
    if (!layer) return;
    layer.clearLayers();
    waypoints.forEach((w, i) => {
      const sel = w.id === selectedId;
      const icon = L.divIcon({
        className: 'scout-pin-wrap',
        html: `<div class="scout-pin${sel ? ' is-sel' : ''}">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([w.lat, w.lng], { icon })
        .on('click', () => stateRef.current(w.id))
        .addTo(layer);
    });
  }, [waypoints, selectedId]);

  return <div className="scout-map" ref={containerRef} aria-label="Scout map" />;
}
