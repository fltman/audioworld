import L from 'leaflet';
import type { Coordinates, PointType } from '@audioworld/shared';
import { POINT_TYPE_META } from '../pointTypes';

/** One moving source for one animation frame. */
export interface GhostFrame {
  id: string;
  type: PointType;
  position: Coordinates;
  /** Audible range in metres — a ring that travels with the source. */
  radius: number;
  /** Text beside the pin (time into the route), or null for none. */
  label: string | null;
  /** Dwelling at a guided-tour stop. */
  dwelling: boolean;
  /** Heard by the playtest listener right now. */
  audible: boolean;
}

interface Ghost {
  marker: L.Marker;
  ring: L.Circle;
  type: PointType;
  radius: number;
  label: string | null;
  dwelling: boolean;
  audible: boolean;
}

function ghostIcon(type: PointType): L.DivIcon {
  const meta = POINT_TYPE_META[type];
  return L.divIcon({
    className: 'aw-marker-wrap',
    html:
      `<div class="aw-ghost" style="--c:${meta.color}">` +
      `<span class="aw-ghost__pin">${meta.short}</span><span class="aw-ghost__label"></span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * Moving sources drawn where they are right now: the type's pin travelling the map with
 * its audible range around it, so an author can see a route's pace and timing (and,
 * while playtesting, which of them the listener can hear). Non-interactive, so clicks
 * fall through to the map. Call `update` every frame with the current positions.
 */
export class GhostLayer {
  private readonly layer: L.LayerGroup;
  private readonly ghosts = new Map<string, Ghost>();

  constructor(map: L.Map) {
    this.layer = L.layerGroup().addTo(map);
  }

  update(frames: GhostFrame[]): void {
    const seen = new Set<string>();
    for (const f of frames) {
      seen.add(f.id);
      const at: [number, number] = [f.position.lat, f.position.lng];
      let g = this.ghosts.get(f.id);
      if (!g || g.type !== f.type) {
        if (g) this.drop(f.id, g);
        const color = POINT_TYPE_META[f.type].color;
        const ring = L.circle(at, {
          radius: f.radius,
          color,
          weight: 1,
          opacity: 0.7,
          dashArray: '2 5',
          fillColor: color,
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(this.layer);
        const marker = L.marker(at, {
          icon: ghostIcon(f.type),
          interactive: false,
          keyboard: false,
          zIndexOffset: 500,
        }).addTo(this.layer);
        g = { marker, ring, type: f.type, radius: f.radius, label: null, dwelling: false, audible: false };
        this.ghosts.set(f.id, g);
      }
      g.marker.setLatLng(at);
      g.ring.setLatLng(at);
      if (g.radius !== f.radius) {
        g.radius = f.radius;
        g.ring.setRadius(f.radius);
      }
      const el = g.marker.getElement()?.querySelector<HTMLElement>('.aw-ghost');
      if (!el) continue;
      if (g.label !== f.label) {
        g.label = f.label;
        el.querySelector('.aw-ghost__label')!.textContent = f.label ?? '';
      }
      if (g.dwelling !== f.dwelling) {
        g.dwelling = f.dwelling;
        el.classList.toggle('is-dwelling', f.dwelling);
      }
      if (g.audible !== f.audible) {
        g.audible = f.audible;
        el.classList.toggle('is-audible', f.audible);
      }
    }
    for (const [id, g] of this.ghosts) if (!seen.has(id)) this.drop(id, g);
  }

  remove(): void {
    this.layer.remove();
    this.ghosts.clear();
  }

  private drop(id: string, g: Ghost): void {
    this.layer.removeLayer(g.marker);
    this.layer.removeLayer(g.ring);
    this.ghosts.delete(id);
  }
}
