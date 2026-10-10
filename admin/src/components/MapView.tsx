import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import {
  anchorOf,
  audibleRadiusOf,
  pathVertexTimes,
  sectorPolygon,
  triggerRadiusOf,
  type AcousticZone,
  type AudioPoint,
  type BBox,
  type Coordinates,
  type DiscoveredPlace,
  type PointType,
  type ScoutWaypoint,
} from '@audioworld/shared';
import type { DraftState } from '../draft';
import { draftAudibleRadius } from '../draft';
import { POINT_TYPE_META, POINT_TYPE_ORDER, isPathType } from '../pointTypes';
import { absoluteAudioUrl } from '../api';
import type { PreviewEngine, PreviewFrame } from '../services/previewEngine';
import { moverAt, moversOf } from '../motion';
import { GhostLayer } from './ghostLayer';

const ACCENT = '#7c5cff';
const DEFAULT_CENTER: [number, number] = [59.3293, 18.0686];
const DEFAULT_ZOOM = 15;
/** Playtest camera: once the walking listener comes within this fraction of the map's
 *  size from an edge, the map scrolls along with it (a game-camera deadzone). */
const FOLLOW_MARGIN = 0.3;
/** Cap camera pans at ~20/s — every pan fires moveend, which re-renders the app. */
const FOLLOW_MIN_MS = 50;
/** Source types that travel — drawn as moving pins while playtesting. */
const MOVING_TYPES = new Set<PointType>(['path', 'path_triggered', 'static_circling', 'follow_user']);
/** Motion-preview playback rates (fast-forward long routes). */
const MOTION_RATES = [1, 4, 10] as const;

interface Props {
  points: AudioPoint[];
  draft: DraftState | null;
  fitToken: number;
  onMapClick: (c: Coordinates) => void;
  onMapDblClick: () => void;
  onAnchorDrag: (c: Coordinates) => void;
  onPathVertexDrag: (index: number, c: Coordinates) => void;
  onSelectPoint: (id: string) => void;
  /** Multi-select mode: clicking a point toggles it into the selection instead of editing. */
  multiSelect?: boolean;
  /** Ids currently in the multi-select set (highlighted on the map). */
  selectedIds?: string[];
  /** Toggle a point in/out of the multi-select set. */
  onToggleSelect?: (id: string) => void;
  /** When set, the map hosts a draggable virtual listener for the playtest. */
  preview: PreviewEngine | null;
  /** Acoustic zones to draw as filled polygons. */
  zones?: AcousticZone[];
  /** In-progress zone polygon vertices (while drawing a new zone). */
  zoneDraft?: Coordinates[] | null;
  /** True while the user is laying down a zone polygon (debounce clicks, free the dblclick). */
  drawingZone?: boolean;
  /** Aggregate heatmap cells: "lat,lng" (4dp) → seconds dwelt. Drawn as warm circles. */
  analyticsCells?: Record<string, number>;
  /** Read-only scout waypoints overlaid as a reference layer while authoring. */
  scoutWaypoints?: ScoutWaypoint[];
  /** Notified with the current map bounds (on pan/zoom) for area-based place discovery. */
  onViewport?: (bbox: BBox) => void;
  /** Discovered candidate places drawn as selectable pins. */
  discoverPlaces?: DiscoveredPlace[];
  /** Indices of selected candidate places (highlighted). */
  selectedPlaces?: number[];
  /** Toggle a candidate place in/out of the selection. */
  onTogglePlace?: (index: number) => void;
}

const toCoord = (ll: L.LatLng): Coordinates => ({ lat: ll.lat, lng: ll.lng });

/** Escape a user-controlled string before interpolating it into Leaflet HTML (divIcon
 *  / bindTooltip render their string as HTML, so an unescaped name is a DOM-XSS sink). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function markerIcon(color: string, big: boolean, symbol: string, selected = false): L.DivIcon {
  const s = big ? 26 : 22;
  const cls = selected ? 'aw-marker aw-marker--selected' : 'aw-marker';
  return L.divIcon({
    className: 'aw-marker-wrap',
    html: `<div class="${cls}" style="--c:${color};width:${s}px;height:${s}px;line-height:${s}px">${symbol}</div>`,
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

function drawPoint(
  layer: L.LayerGroup,
  p: AudioPoint,
  onClick: () => void,
  selected = false
): void {
  const meta = POINT_TYPE_META[p.type];
  const a = anchorOf(p);
  const isTrigger = triggerRadiusOf(p) !== null;

  // A directional static point shows its audible wedge instead of a full circle.
  const dir = p.type === 'static' && p.spread != null && p.spread < 360;
  if (dir) {
    L.polygon(
      sectorPolygon(a, audibleRadiusOf(p), p.facing ?? 0, p.spread!).map(
        (c) => [c.lat, c.lng] as [number, number]
      ),
      {
        color: meta.color,
        weight: 1.5,
        fillColor: meta.color,
        fillOpacity: 0.1,
        dashArray: isTrigger ? '6 6' : undefined,
        interactive: false,
      }
    ).addTo(layer);
  } else {
    L.circle([a.lat, a.lng], {
      radius: audibleRadiusOf(p),
      color: meta.color,
      weight: 1.5,
      fillColor: meta.color,
      fillOpacity: 0.08,
      dashArray: isTrigger ? '6 6' : undefined,
      interactive: false,
    }).addTo(layer);
  }

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
  if (p.type === 'path' || p.type === 'path_triggered') {
    drawPathTimes(layer, p.path, p.speed, p.stops);
  }

  L.marker([a.lat, a.lng], { icon: markerIcon(meta.color, selected, meta.short, selected) })
    .on('click', onClick)
    .addTo(layer);
}

export default function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pointsLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const analyticsLayerRef = useRef<L.LayerGroup | null>(null);
  const scoutLayerRef = useRef<L.LayerGroup | null>(null);
  const discoverLayerRef = useRef<L.LayerGroup | null>(null);
  const clickTimer = useRef<number | null>(null);
  const stateRef = useRef(props);
  stateRef.current = props;

  // Motion-preview clock, advanced by the animation loop (refs: no re-render per frame).
  const motion = useRef({ clockSec: 0, playing: true, rate: 1, restartWallMs: Date.now() });
  const motionClockRef = useRef<HTMLSpanElement>(null);
  const [hasMovers, setHasMovers] = useState(false);
  const [motionPlaying, setMotionPlaying] = useState(true);
  const [motionRate, setMotionRate] = useState(1);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

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

    // Re-measure whenever the container resizes: the initial flex layout settling, the
    // right-hand inspector opening/closing (which changes the map width), and window
    // resizes. Without this Leaflet keeps a stale size and tiles render offset.
    const resizeObs = new ResizeObserver(() => map.invalidateSize());
    resizeObs.observe(containerRef.current);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    analyticsLayerRef.current = L.layerGroup().addTo(map); // heatmap, bottom of the stack
    zonesLayerRef.current = L.layerGroup().addTo(map); // under the point markers
    pointsLayerRef.current = L.layerGroup().addTo(map);
    scoutLayerRef.current = L.layerGroup().addTo(map); // reference pins above points
    discoverLayerRef.current = L.layerGroup().addTo(map);
    draftLayerRef.current = L.layerGroup().addTo(map);

    // Report the visible bounds for area-based place discovery (throttled by moveend).
    const emitViewport = () => {
      const b = map.getBounds();
      stateRef.current.onViewport?.({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    };
    map.on('moveend', emitViewport);
    map.whenReady(emitViewport);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const c = toCoord(e.latlng);
      // In playtest mode a map click walks the virtual listener there instead of placing points.
      if (stateRef.current.preview) {
        stateRef.current.preview.walkTo(c);
        return;
      }
      const d = stateRef.current.draft;
      const drawing =
        (!!d && isPathType(d.type) && d.drawingPath) || !!stateRef.current.drawingZone;
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
      resizeObs.disconnect();
      map.remove();
      mapRef.current = null;
      pointsLayerRef.current = null;
      draftLayerRef.current = null;
      zonesLayerRef.current = null;
      analyticsLayerRef.current = null;
      scoutLayerRef.current = null;
      discoverLayerRef.current = null;
    };
  }, []);

  // Draw the aggregate heatmap: warm circles, opacity by relative dwell time.
  useEffect(() => {
    const layer = analyticsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const cells = props.analyticsCells;
    if (!cells) return;
    const values = Object.values(cells);
    if (values.length === 0) return;
    const max = Math.max(...values);
    for (const [key, v] of Object.entries(cells)) {
      const [lat, lng] = key.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const t = max > 0 ? Math.min(1, v / max) : 0;
      L.circle([lat, lng], {
        radius: 8,
        stroke: false,
        fillColor: '#ff6a3d',
        fillOpacity: 0.12 + t * 0.5,
        interactive: false,
      }).addTo(layer);
    }
  }, [props.analyticsCells]);

  // Draw the scout reference layer: numbered pins with the field note (+ voice note) in
  // a popup, so the author can place real points using the scouted spots as a guide.
  useEffect(() => {
    const layer = scoutLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const wps = props.scoutWaypoints;
    if (!wps) return;
    wps.forEach((w, i) => {
      const icon = L.divIcon({
        className: 'scout-ref-wrap',
        html: `<div class="scout-ref">${i + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const noteHtml = w.note ? `<div class="scout-pop__note">${esc(w.note)}</div>` : '';
      const audioHtml = w.audioUrl
        ? `<audio controls preload="none" src="${absoluteAudioUrl(w.audioUrl)}" style="width:220px"></audio>`
        : '';
      const accHtml = w.accuracy != null ? `<div class="scout-pop__acc">±${Math.round(w.accuracy)} m</div>` : '';
      L.marker([w.lat, w.lng], { icon })
        .bindPopup(`<div class="scout-pop"><b>#${i + 1}</b>${noteHtml}${audioHtml}${accHtml}</div>`)
        .addTo(layer);
    });
  }, [props.scoutWaypoints]);

  // Draw discovered candidate places as selectable pins (green teardrops); a tap toggles
  // whether the place is included when converting to audio points.
  useEffect(() => {
    const layer = discoverLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const places = props.discoverPlaces;
    if (!places) return;
    const selected = new Set(props.selectedPlaces ?? []);
    places.forEach((p, i) => {
      const on = selected.has(i);
      const icon = L.divIcon({
        className: 'discover-pin-wrap',
        html: `<div class="discover-pin${on ? ' is-on' : ''}" title="${esc(p.name)}">${on ? '✓' : ''}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([p.lat, p.lng], { icon })
        .bindTooltip(`${esc(p.name)} · ${esc(p.kind)}`)
        .on('click', () => stateRef.current.onTogglePlace?.(i))
        .addTo(layer);
    });
  }, [props.discoverPlaces, props.selectedPlaces]);

  // Draw acoustic zones (filled polygons) + the in-progress zone outline.
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const z of props.zones ?? []) {
      if (z.polygon.length < 3) continue;
      L.polygon(
        z.polygon.map((c) => [c.lat, c.lng] as [number, number]),
        { color: '#3fd0c9', weight: 1.5, fillColor: '#3fd0c9', fillOpacity: 0.14 }
      )
        .bindTooltip(`${esc(z.name)} · ${esc(z.reverb)}`, { sticky: true })
        .addTo(layer);
    }
    const d = props.zoneDraft;
    if (d && d.length > 0) {
      const latlngs = d.map((c) => [c.lat, c.lng] as [number, number]);
      L.polyline([...latlngs, ...(d.length >= 3 ? [latlngs[0]!] : [])], {
        color: '#3fd0c9',
        weight: 2,
        dashArray: '5,5',
      }).addTo(layer);
      for (const c of d) {
        L.circleMarker([c.lat, c.lng], {
          radius: 4,
          color: '#3fd0c9',
          fillColor: '#3fd0c9',
          fillOpacity: 1,
        }).addTo(layer);
      }
    }
  }, [props.zones, props.zoneDraft]);

  // Playtest: a draggable virtual listener. A loop keeps the marker synced to the
  // engine (which the keyboard + click-to-walk also drive), rotates its cone to the
  // heading, scrolls the map along as it walks, and plots where every sound is right
  // now — moving ones travel their routes, and each one you can hear gets a line to
  // the listener.
  useEffect(() => {
    const map = mapRef.current;
    const preview = props.preview;
    if (!map || !preview) return;

    const ghosts = new GhostLayer(map);
    const lineLayer = L.layerGroup().addTo(map);
    const lines = new Map<string, L.Polyline>();
    const drawLive = (f: PreviewFrame) => {
      ghosts.update(
        f.sources.flatMap((s) =>
          s.position && MOVING_TYPES.has(s.type)
            ? [{ id: s.id, type: s.type, position: s.position, radius: s.radius, label: null, dwelling: false, audible: s.audible }]
            : []
        )
      );
      // A line from the listener to every source it can hear.
      const here: [number, number] = [f.listener.lat, f.listener.lng];
      const heard = new Set<string>();
      for (const s of f.sources) {
        if (!s.position || !s.audible) continue;
        heard.add(s.id);
        const at: [number, number] = [s.position.lat, s.position.lng];
        const line = lines.get(s.id);
        if (line) line.setLatLngs([here, at]);
        else
          lines.set(
            s.id,
            L.polyline([here, at], {
              color: POINT_TYPE_META[s.type].color,
              weight: 2,
              opacity: 0.8,
              dashArray: '4 6',
              interactive: false,
            }).addTo(lineLayer)
          );
      }
      for (const [id, line] of lines) {
        if (heard.has(id)) continue;
        lineLayer.removeLayer(line);
        lines.delete(id);
      }
    };

    const marker = L.marker([preview.listener.lat, preview.listener.lng], {
      icon: listenerIcon(),
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);
    map.setView([preview.listener.lat, preview.listener.lng], map.getZoom());

    // Dragging the listener moves it live (you hear the sweep), facing the drag.
    let dragging = false;
    marker.on('dragstart', () => {
      dragging = true;
    });
    marker.on('drag', () => preview.dragTo(toCoord(marker.getLatLng())));
    marker.on('dragend', () => {
      dragging = false;
      preview.dragTo(toCoord(marker.getLatLng()));
      preview.endDrag();
    });
    // Don't steer the camera while the author is panning or zooming by hand.
    let mapBusy = false;
    const busy = () => {
      mapBusy = true;
    };
    const idle = () => {
      mapBusy = false;
    };
    map.on('dragstart zoomstart', busy);
    map.on('dragend zoomend', idle);

    // Scroll the map just enough to keep the listener out of the edge margin. Only
    // while it moves, so panning away to look around while standing still sticks.
    const keepInView = (here: Coordinates) => {
      const size = map.getSize();
      const p = map.latLngToContainerPoint([here.lat, here.lng]);
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) {
        // Walking again after the author panned away: bring the listener back to centre.
        map.setView([here.lat, here.lng], map.getZoom(), { animate: false });
        return;
      }
      const edge = (v: number, len: number) => {
        const m = len * FOLLOW_MARGIN;
        return v < m ? v - m : v > len - m ? v - (len - m) : 0;
      };
      const dx = Math.round(edge(p.x, size.x));
      const dy = Math.round(edge(p.y, size.y));
      if (dx !== 0 || dy !== 0) map.panBy([dx, dy], { animate: false });
    };

    let raf = 0;
    let lastFollow = 0;
    let lastListener = preview.listener;
    const loop = (now: number) => {
      const here = preview.listener;
      if (!dragging) marker.setLatLng([here.lat, here.lng]);
      const cone = marker.getElement()?.querySelector<HTMLElement>('.aw-listener__cone');
      if (cone) cone.style.transform = `rotate(${preview.heading}deg)`;
      if (preview.lastFrame) drawLive(preview.lastFrame);
      if (here !== lastListener && !dragging && !mapBusy && now - lastFollow >= FOLLOW_MIN_MS) {
        lastListener = here;
        lastFollow = now;
        keepInView(here);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      map.off('dragstart zoomstart', busy);
      map.off('dragend zoomend', idle);
      marker.remove();
      ghosts.remove();
      lineLayer.remove();
    };
  }, [props.preview]);

  // Motion preview (while editing): every moving source — and the point being edited,
  // with its unsaved settings — travels its route on the map, with the time into the
  // route beside it, so pace and timing can be checked against the vertex labels.
  // Playtest draws live positions from its engine instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.preview) return;
    const ghosts = new GhostLayer(map);
    let raf = 0;
    let last = performance.now();
    let any = false;
    const loop = (now: number) => {
      const m = motion.current;
      if (m.playing) m.clockSec += ((now - last) / 1000) * m.rate;
      last = now;
      const s = stateRef.current;
      const movers = moversOf(s.points, s.draft, m.restartWallMs);
      ghosts.update(
        movers.map((mv) => {
          const st = moverAt(mv, m.clockSec);
          return {
            id: mv.id,
            type: mv.type,
            position: st.position,
            radius: mv.radius,
            label: st.tripSec != null ? fmtTime(st.tripSec) : null,
            dwelling: st.dwelling,
            audible: false,
          };
        })
      );
      if (movers.length > 0 !== any) {
        any = movers.length > 0;
        setHasMovers(any);
      }
      if (motionClockRef.current) motionClockRef.current.textContent = fmtTime(m.clockSec);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ghosts.remove();
      setHasMovers(false);
    };
  }, [props.preview]);

  // Redraw existing points (hiding the one being edited, shown as the draft).
  useEffect(() => {
    const layer = pointsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const hideId = props.draft?.editingId ?? null;
    const selected = new Set(props.selectedIds ?? []);
    for (const p of props.points) {
      if (hideId && p.id === hideId) continue;
      const id = p.id;
      drawPoint(
        layer,
        p,
        () => {
          const s = stateRef.current;
          // Playtesting: clicking a point walks the listener over to it.
          if (s.preview) s.preview.walkTo(anchorOf(p));
          else if (s.multiSelect) s.onToggleSelect?.(id);
          else s.onSelectPoint(id);
        },
        selected.has(id)
      );
    }
  }, [props.points, props.draft?.editingId, props.selectedIds, props.multiSelect]);

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
      if ((d.type === 'path' || d.type === 'path_triggered') && !d.drawingPath) {
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
    const draftDir = d.type === 'static' && d.directional && d.spread > 0 && d.spread < 360;
    if (radius > 0 && draftDir) {
      L.polygon(
        sectorPolygon(d.center, radius, d.facing, d.spread).map(
          (c) => [c.lat, c.lng] as [number, number]
        ),
        { color: ACCENT, weight: 1.5, fillColor: meta.color, fillOpacity: 0.12, interactive: false }
      ).addTo(layer);
    } else if (radius > 0) {
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

  // Free the double-click for finishing a path or zone while drawing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const d = props.draft;
    const drawing = (!!d && isPathType(d.type) && d.drawingPath) || !!props.drawingZone;
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [props.draft, props.drawingZone]);

  // Geocode a place name via Nominatim and recentre the map on the first hit.
  const goToPlace = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    const map = mapRef.current;
    if (!q || !map || searching) return;
    setSearching(true);
    setNotFound(false);
    try {
      const res = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)
      );
      const hits = (await res.json()) as { lat: string; lon: string }[];
      const hit = hits[0];
      if (hit) map.setView([+hit.lat, +hit.lon], 16);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const d = props.draft;
  const placing = !!d && (isPathType(d.type) ? d.drawingPath : true);

  return (
    <div className={`mapwrap${placing ? ' mapwrap--placing' : ''}`}>
      {/* The Leaflet container keeps a stable className — Leaflet appends its own
          classes (leaflet-container, etc.) and React must never overwrite them. */}
      <div ref={containerRef} className="map" />

      {/* Place search — stop pointer/click events so they never reach the map. */}
      <form
        className="map-search"
        onSubmit={goToPlace}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          className="map-search__input"
          type="text"
          placeholder="Go to place…"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setNotFound(false);
          }}
        />
        <button type="submit" className="map-search__btn" disabled={searching || !query.trim()}>
          {searching ? '…' : 'Go'}
        </button>
        {notFound && <span className="map-search__hint">Not found</span>}
      </form>

      {hasMovers && !props.preview && (
        <div
          className="map-motion"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="map-motion__title">Motion</span>
          <button
            type="button"
            className="map-motion__btn"
            title={motionPlaying ? 'Pause' : 'Play'}
            onClick={() => {
              motion.current.playing = !motion.current.playing;
              setMotionPlaying(motion.current.playing);
            }}
          >
            {motionPlaying ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="map-motion__btn"
            title="Restart every route from 0:00"
            onClick={() => {
              motion.current.clockSec = 0;
              motion.current.restartWallMs = Date.now();
            }}
          >
            ↺
          </button>
          <span ref={motionClockRef} className="map-motion__clock">
            0:00
          </span>
          <div className="seg">
            {MOTION_RATES.map((r) => (
              <button
                key={r}
                type="button"
                className={motionRate === r ? 'active' : ''}
                onClick={() => {
                  motion.current.rate = r;
                  setMotionRate(r);
                }}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      )}

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
