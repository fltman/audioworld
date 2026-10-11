import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import L from 'leaflet';
import type { Coordinates, PointType } from '@audioworld/shared';
import type { ExperienceEngine, FrameState } from '../services/experience';
import { drawRoute } from './route';

interface MapViewProps {
  engine: ExperienceEngine;
  frameRef: MutableRefObject<FrameState>;
  /** The course's planned route, drawn under the sounds to walk along. */
  route?: Coordinates[];
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

function goalIcon(): L.DivIcon {
  return L.divIcon({ className: 'exp-goal', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}

/** Escape a name before it goes into a marker's HTML. */
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function sourceIcon(color: string, name: string): L.DivIcon {
  return L.divIcon({
    className: 'exp-src',
    // The label only shows on a "next" sound (where to walk now).
    html: `<span style="--c:${color}"></span><em class="exp-src__next">Next · ${esc(name)}</em>`,
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
export function MapView({ engine, frameRef, route }: MapViewProps) {
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

    // Subdomain-less host so URLs match exactly what an offline pack precaches.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    if (route) drawRoute(map, route);
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

    // Simulating: click the map to walk there (a ring marks where you're headed).
    const goal = L.marker(DEFAULT_CENTER, { icon: goalIcon(), interactive: false, keyboard: false });
    if (engine.isSim()) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        engine.simWalkTo({ lat: e.latlng.lat, lng: e.latlng.lng });
        following.current = true;
      });
    }

    map.invalidateSize();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    let raf = 0;
    let centered = false;
    const guideLines = new Map<string, L.Polyline>();

    const loop = () => {
      const f = frameRef.current;

      const dest = engine.simDestination();
      if (dest) {
        goal.setLatLng([dest.lat, dest.lng]);
        if (!map.hasLayer(goal)) goal.addTo(map);
      } else if (map.hasLayer(goal)) {
        goal.remove();
      }

      if (f.user) {
        const ll: L.LatLngExpression = [f.user.lat, f.user.lng];
        userMarker.current!.setLatLng(ll);
        const el = userMarker.current!.getElement();
        const cone = el?.querySelector<HTMLElement>('.exp-user__cone');
        if (cone) cone.style.transform = `rotate(${f.headingDeg ?? 0}deg)`;
        if (!centered) {
          map.setView(ll, engine.isSim() ? 17 : 16, { animate: false }); // closer in on a desktop sim
          centered = true;
        } else if (following.current) {
          map.panTo(ll, { animate: false });
        }
      }

      // The author's next sounds: highlighted, with a dashed line from you to each.
      const nextIds = new Set(f.nearby.filter((n) => n.next).map((n) => n.id));
      for (const [id, line] of guideLines) {
        if (!nextIds.has(id) || !f.user) {
          line.remove();
          guideLines.delete(id);
        }
      }
      if (f.user) {
        for (const s of f.sources) {
          if (!s.position || !nextIds.has(s.id)) continue;
          const pts: L.LatLngExpression[] = [
            [f.user.lat, f.user.lng],
            [s.position.lat, s.position.lng],
          ];
          const line = guideLines.get(s.id);
          if (line) line.setLatLngs(pts);
          else guideLines.set(s.id, L.polyline(pts, { color: '#ffcf6b', weight: 4, opacity: 0.9, dashArray: '1 10', lineCap: 'round', interactive: false }).addTo(map));
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
          const marker = L.marker(ll, { icon: sourceIcon(color, s.name), interactive: false });
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
        const isNext = nextIds.has(s.id);
        node.marker.setOpacity(s.audible || isNext ? 1 : 0.5);
        node.marker.setZIndexOffset(isNext ? 500 : 0);
        node.marker.getElement()?.classList.toggle('is-next', isNext);
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
