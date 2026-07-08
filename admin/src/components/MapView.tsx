import { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  anchorOf,
  audibleRadiusOf,
  pathVertexTimes,
  triggerRadiusOf,
  type AudioPoint,
  type Coordinates,
} from '@audioworld/shared';
import type { DraftState } from '../draft';
import { draftAudibleRadius } from '../draft';
import { POINT_TYPE_META, POINT_TYPE_ORDER, isPathType } from '../pointTypes';
import type { PreviewEngine } from '../services/previewEngine';

const ACCENT = '#7c5cff';
const DEFAULT_CENTER: [number, number] = [59.3293, 18.0686];
const DEFAULT_ZOOM = 15;

interface Props {
  points: AudioPoint[];
  draft: DraftState | null;
  fitToken: number;
  onMapClick: (c: Coordinates) => void;
  onMapDblClick: () => void;
  onAnchorDrag: (c: Coordinates) => void;
  onPathVertexDrag: (index: number, c: Coordinates) => void;
  onSelectPoint: (id: string) => void;
  /** When set, the map hosts a draggable virtual listener for the playtest. */
  preview: PreviewEngine | null;
}

const toCoord = (ll: L.LatLng): Coordinates => ({ lat: ll.lat, lng: ll.lng });

function markerIcon(color: string, big: boolean, symbol: string): L.DivIcon {
  const s = big ? 26 : 22;
  return L.divIcon({
    className: 'aw-marker-wrap',
    html: `<div class="aw-marker" style="--c:${color};width:${s}px;height:${s}px;line-height:${s}px">${symbol}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function vertexIcon(): L.DivIcon {
  const s = 14;
  return L.divIcon({
    className: 'aw-marker-wrap',
    html: `<div class="aw-vertex" style="--c:${ACCENT}"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function timeIcon(text: string, isStop: boolean): L.DivIcon {
  return L.divIcon({
    className: 'aw-time',
    html: `<span class="aw-time__label${isStop ? ' is-stop' : ''}">${text}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Add arrival-time labels at each vertex of a path (accounts for stop dwells). */
function drawPathTimes(
  layer: L.LayerGroup,
  path: Coordinates[],
  speed: number,
  stops: { index: number; dwellSec: number }[] | undefined
): void {
  if (path.length < 2 || speed <= 0) return;
  const times = pathVertexTimes(path, speed, stops);
  path.forEach((c, i) => {
    const isStop = !!stops?.some((s) => s.index === i && s.dwellSec > 0);
    L.marker([c.lat, c.lng], { icon: timeIcon(fmtTime(times[i] ?? 0), isStop), interactive: false })
      .addTo(layer);
  });
}

function listenerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'aw-listener',
    html: '<div class="aw-listener__cone"></div><div class="aw-listener__dot"></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function fitToPoints(map: L.Map, points: AudioPoint[]): void {
  const coords: [number, number][] = [];
  for (const p of points) {
    const a = anchorOf(p);
    coords.push([a.lat, a.lng]);
    if (p.type === 'path' || p.type === 'path_triggered') {
      for (const c of p.path) coords.push([c.lat, c.lng]);
    }
  }
  if (coords.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }
  map.fitBounds(L.latLngBounds(coords).pad(0.25), { maxZoom: 17 });
}

function drawPoint(layer: L.LayerGroup, p: AudioPoint, onClick: () => void): void {
  const meta = POINT_TYPE_META[p.type];
  const a = anchorOf(p);
  const isTrigger = triggerRadiusOf(p) !== null;

  L.circle([a.lat, a.lng], {
    radius: audibleRadiusOf(p),
    color: meta.color,
    weight: 1.5,
    fillColor: meta.color,
    fillOpacity: 0.08,
    dashArray: isTrigger ? '6 6' : undefined,
    interactive: false,
  }).addTo(layer);

  if (p.type === 'static_circling') {
    L.circle([p.center.lat, p.center.lng], {
      radius: p.circleRadius,
      color: meta.color,
      weight: 1,
      opacity: 0.6,
      fill: false,
      dashArray: '3 6',
      interactive: false,
    }).addTo(layer);
  }

  if (p.type === 'path' || p.type === 'path_triggered') {
    L.polyline(
      p.path.map((c) => [c.lat, c.lng] as [number, number]),
      { color: meta.color, weight: 3, opacity: 0.85, interactive: false }
    ).addTo(layer);
  }
  if (p.type === 'path') {
    drawPathTimes(layer, p.path, p.speed, p.stops);
  }

  L.marker([a.lat, a.lng], { icon: markerIcon(meta.color, false, meta.short) })
    .on('click', onClick)
    .addTo(layer);
}

export default function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pointsLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const clickTimer = useRef<number | null>(null);
  const stateRef = useRef(props);
  stateRef.current = props;

  // Create the map exactly once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    // fadeAnimation:false — the tile opacity fade-in is driven by a requestAnimationFrame
    // loop that React StrictMode's mount/unmount/remount can orphan in dev, leaving tiles
    // stuck at opacity 0. Disabling the fade makes tiles paint immediately at full opacity.
    const map = L.map(containerRef.current, {
      zoomControl: true,
      fadeAnimation: false,
    }).setView(
      DEFAULT_CENTER,
      DEFAULT_ZOOM
    );
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    pointsLayerRef.current = L.layerGroup().addTo(map);
    draftLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const c = toCoord(e.latlng);
      // In playtest mode a map click moves the virtual listener instead of placing points.
      if (stateRef.current.preview) {
        stateRef.current.preview.setListener(c);
        return;
      }
      const d = stateRef.current.draft;
      const drawing = !!d && isPathType(d.type) && d.drawingPath;
      if (drawing) {
        // Debounce so the two clicks of a double-click don't add stray vertices.
        if (clickTimer.current) window.clearTimeout(clickTimer.current);
        clickTimer.current = window.setTimeout(() => stateRef.current.onMapClick(c), 220);
      } else {
        stateRef.current.onMapClick(c);
      }
    });

    map.on('dblclick', () => {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      stateRef.current.onMapDblClick();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      pointsLayerRef.current = null;
      draftLayerRef.current = null;
    };
  }, []);

  // Playtest: a draggable virtual listener. A loop keeps the marker synced to the
  // engine (which the keyboard also drives) and rotates its cone to the heading.
  useEffect(() => {
    const map = mapRef.current;
    const preview = props.preview;
    if (!map || !preview) return;

    const marker = L.marker([preview.listener.lat, preview.listener.lng], {
      icon: listenerIcon(),
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);
    map.setView([preview.listener.lat, preview.listener.lng], map.getZoom());

    let dragging = false;
    marker.on('dragstart', () => {
      dragging = true;
    });
    marker.on('dragend', () => {
      dragging = false;
      preview.setListener(toCoord(marker.getLatLng()));
    });

    let raf = 0;
    const loop = () => {
      if (!dragging) marker.setLatLng([preview.listener.lat, preview.listener.lng]);
      const cone = marker.getElement()?.querySelector<HTMLElement>('.aw-listener__cone');
      if (cone) cone.style.transform = `rotate(${preview.heading}deg)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      marker.remove();
    };
  }, [props.preview]);

  // Redraw existing points (hiding the one being edited, shown as the draft).
  useEffect(() => {
    const layer = pointsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const hideId = props.draft?.editingId ?? null;
    for (const p of props.points) {
      if (hideId && p.id === hideId) continue;
      const id = p.id;
      drawPoint(layer, p, () => stateRef.current.onSelectPoint(id));
    }
  }, [props.points, props.draft?.editingId]);

  // Redraw the live draft geometry.
  useEffect(() => {
    const layer = draftLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const d = props.draft;
    if (!d) return;

    const meta = POINT_TYPE_META[d.type];
    const radius = draftAudibleRadius(d);
    const isTrigger = d.type === 'follow_user' || d.type === 'path_triggered';

    if (isPathType(d.type)) {
      if (d.path.length === 0) return;
      L.polyline(
        d.path.map((c) => [c.lat, c.lng] as [number, number]),
        { color: ACCENT, weight: 3, dashArray: d.drawingPath ? '6 6' : undefined, interactive: false }
      ).addTo(layer);
      if (d.type === 'path' && !d.drawingPath) {
        drawPathTimes(layer, d.path, d.speed, d.stops);
      }
      const start = d.path[0]!;
      if (radius > 0) {
        L.circle([start.lat, start.lng], {
          radius,
          color: ACCENT,
          weight: 1.5,
          fillColor: meta.color,
          fillOpacity: 0.1,
          dashArray: isTrigger ? '6 6' : undefined,
          interactive: false,
        }).addTo(layer);
      }
      d.path.forEach((c, i) => {
        const handle = L.marker([c.lat, c.lng], { draggable: true, icon: vertexIcon() });
        handle.on('dragend', () =>
          stateRef.current.onPathVertexDrag(i, toCoord(handle.getLatLng()))
        );
        handle.addTo(layer);
      });
      return;
    }

    if (!d.center) return;
    if (radius > 0) {
      L.circle([d.center.lat, d.center.lng], {
        radius,
        color: ACCENT,
        weight: 1.5,
        fillColor: meta.color,
        fillOpacity: 0.1,
        dashArray: isTrigger ? '6 6' : undefined,
        interactive: false,
      }).addTo(layer);
    }
    if (d.type === 'static_circling') {
      L.circle([d.center.lat, d.center.lng], {
        radius: d.circleRadius,
        color: ACCENT,
        weight: 1,
        fill: false,
        dashArray: '3 6',
        interactive: false,
      }).addTo(layer);
    }
    const marker = L.marker([d.center.lat, d.center.lng], {
      draggable: true,
      icon: markerIcon(ACCENT, true, meta.short),
    });
    marker.on('dragend', () => stateRef.current.onAnchorDrag(toCoord(marker.getLatLng())));
    marker.addTo(layer);
  }, [props.draft]);

  // Fit the view whenever the caller bumps the token (course changes / loads).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    fitToPoints(map, stateRef.current.points);
  }, [props.fitToken]);

  // Free the double-click for finishing a path while drawing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const d = props.draft;
    const drawing = !!d && isPathType(d.type) && d.drawingPath;
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [props.draft]);

  const d = props.draft;
  const placing = !!d && (isPathType(d.type) ? d.drawingPath : true);

  return (
    <div className={`mapwrap${placing ? ' mapwrap--placing' : ''}`}>
      {/* The Leaflet container keeps a stable className — Leaflet appends its own
          classes (leaflet-container, etc.) and React must never overwrite them. */}
      <div ref={containerRef} className="map" />
      <div className="legend">
        {POINT_TYPE_ORDER.map((t) => (
          <div key={t} className="legend-row">
            <span className="dot" style={{ background: POINT_TYPE_META[t].color }} />
            {POINT_TYPE_META[t].label}
          </div>
        ))}
      </div>
    </div>
  );
}
