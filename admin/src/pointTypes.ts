import type { PointType } from '@audioworld/shared';

export interface PointTypeMeta {
  label: string;
  short: string;
  color: string;
  hint: string;
}

/** Stable display order for the toolbar, list and legend. */
export const POINT_TYPE_ORDER: PointType[] = [
  'static',
  'static_circling',
  'path',
  'follow_user',
  'path_triggered',
];

export const POINT_TYPE_META: Record<PointType, PointTypeMeta> = {
  static: {
    label: 'Static',
    short: 'S',
    color: '#4f9dff',
    hint: 'Click the map to set the center.',
  },
  static_circling: {
    label: 'Circling',
    short: 'C',
    color: '#00c2a8',
    hint: 'Click the map to set the orbit center.',
  },
  path: {
    label: 'Path',
    short: 'P',
    color: '#ffb020',
    hint: 'Click to add points, double-click or Finish to complete.',
  },
  follow_user: {
    label: 'Follow',
    short: 'F',
    color: '#ff5d8f',
    hint: 'Click the map to set the start point.',
  },
  path_triggered: {
    label: 'Triggered',
    short: 'T',
    color: '#b76bff',
    hint: 'Click to add points, double-click or Finish to complete.',
  },
};

export const isPathType = (t: PointType): boolean =>
  t === 'path' || t === 'path_triggered';
