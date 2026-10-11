import L from 'leaflet';
import type { Coordinates } from '@audioworld/shared';

/** The planned route's colour: warm, so it reads apart from the sounds' own colours. */
const ROUTE_COLOR = '#f5b84b';

/** Draw the course's planned route — a dashed line from a filled start dot to a ringed
 *  finish — under everything else on `map`. Non-interactive. */
export function drawRoute(map: L.Map, route: Coordinates[]): void {
  if (route.length < 2) return;
  const latlngs = route.map((c) => [c.lat, c.lng] as [number, number]);
  L.polyline(latlngs, {
    color: ROUTE_COLOR,
    weight: 5,
    opacity: 0.85,
    dashArray: '10 9',
    lineCap: 'round',
    interactive: false,
  }).addTo(map);
  L.circleMarker(latlngs[0]!, {
    radius: 6,
    color: '#fff',
    weight: 2,
    fillColor: ROUTE_COLOR,
    fillOpacity: 1,
    interactive: false,
  }).addTo(map);
  L.circleMarker(latlngs[latlngs.length - 1]!, {
    radius: 6,
    color: ROUTE_COLOR,
    weight: 3,
    fillOpacity: 0,
    interactive: false,
  }).addTo(map);
}
