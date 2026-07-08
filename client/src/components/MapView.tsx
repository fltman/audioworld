import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import L from 'leaflet';
import type { PointType } from '@audioworld/shared';
import type { ExperienceEngine, FrameState } from '../services/experience';

interface MapViewProps {
  engine: ExperienceEngine;
  frameRef: MutableRefObject<FrameState>;
}

const TYPE_COLOR: Record<PointType, string> = {
  static: '#4aa3ff',
  static_circling: '#22c7a9',
  path: '#f5a623',
  follow_user: '#ff5c8a',
  path_triggered: '#a06bff',
};

const DEFAULT_CENTER: L.LatLngExpression = [59.3293, 18.0686];

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: 'exp-user',
    html: '<div class="exp-user__cone"></div><div class="exp-user__dot"></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function sourceIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'exp-src',
    html: `<span style="--c:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Geographic view of the experience. The map follows the user; every audio point
 * is drawn at its live world position (moving sources animate) with its audible
 * radius. Colours match the admin. Reads the per-frame ref imperatively so it
 * never triggers React re-renders.
 */
export function MapView({ engine, frameRef }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const srcLayer = useRef<L.LayerGroup | null>(null);
  const srcNodes = useRef(new Map<string, { marker: L.Marker; circle: L.Circle }>());
  const following = useRef(true);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      fadeAnimation: false,
    }).setView(DEFAULT_CENTER, 16);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    srcLayer.current = L.layerGroup().addTo(map);
    userMarker.current = L.marker(DEFAULT_CENTER, {
      icon: userIcon(),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);

    // Stop auto-follow once the user pans the map themselves.
    map.on('dragstart', () => {
      following.current = false;
    });

    map.invalidateSize();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    let raf = 0;
    let centered = false;

    const loop = () => {
      const f = frameRef.current;

      if (f.user) {
        const ll: L.LatLngExpression = [f.user.lat, f.user.lng];
        userMarker.current!.setLatLng(ll);
        const el = userMarker.current!.getElement();
        const cone = el?.querySelector<HTMLElement>('.exp-user__cone');
        if (cone) cone.style.transform = `rotate(${f.headingDeg ?? 0}deg)`;
        if (!centered) {
          map.setView(ll, 16, { animate: false });
          centered = true;
        } else if (following.current) {
          map.panTo(ll, { animate: false });
        }
      }

      const seen = new Set<string>();
      for (const s of f.sources) {
        if (!s.position) continue;
        seen.add(s.id);
        const color = TYPE_COLOR[s.type] ?? '#7c5cff';
        const ll: L.LatLngExpression = [s.position.lat, s.position.lng];
        let node = srcNodes.current.get(s.id);
        if (!node) {
          const marker = L.marker(ll, { icon: sourceIcon(color), interactive: false });
          const circle = L.circle(ll, {
            radius: s.audibleRadius,
            color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.08,
            interactive: false,
          });
          circle.addTo(srcLayer.current!);
          marker.addTo(srcLayer.current!);
          node = { marker, circle };
          srcNodes.current.set(s.id, node);
        }
        node.marker.setLatLng(ll);
        node.marker.setOpacity(s.audible ? 1 : 0.5);
        node.circle.setLatLng(ll);
        node.circle.setRadius(s.audibleRadius);
        node.circle.setStyle({
          opacity: s.audible ? 0.9 : 0.35,
          fillOpacity: s.audible ? 0.14 + 0.18 * s.gain : 0.05,
        });
      }
      for (const [id, node] of srcNodes.current) {
        if (!seen.has(id)) {
          srcLayer.current!.removeLayer(node.marker);
          srcLayer.current!.removeLayer(node.circle);
          srcNodes.current.delete(id);
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      userMarker.current = null;
      srcLayer.current = null;
      srcNodes.current.clear();
    };
  }, [frameRef]);

  const recenter = () => {
    following.current = true;
    const f = frameRef.current;
    if (f.user && mapRef.current) {
      mapRef.current.panTo([f.user.lat, f.user.lng], { animate: true });
    }
  };

  return (
    <div className="mapstage">
      {/* Stable className — Leaflet appends its own classes; React must not overwrite them. */}
      <div ref={containerRef} className="expmap" />
      <button type="button" className="recenter-btn" onClick={recenter} aria-label="Recenter on me">
        &#9673;
      </button>
    </div>
  );
}
