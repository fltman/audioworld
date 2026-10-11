import type { Coordinates } from '@audioworld/shared';
import { pathLength } from '@audioworld/shared';
import ConfirmButton from './ConfirmButton';

/** Walking pace used for the route's time estimate (m/s, an easy stroll). */
const WALK_MPS = 1.3;

interface Props {
  route: Coordinates[] | undefined;
  drawing: boolean;
  draftLen: number;
  /** Start tracing: a fresh route, or carry on from the end of the current one. */
  onDraw: (extend: boolean) => void;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * The planned route: the way listeners are meant to walk, start to finish. It's drawn on
 * their map to help them find their way, and briefs the AI assistant on where points go.
 */
export default function RoutePanel({ route, drawing, draftLen, onDraw, onUndo, onFinish, onCancel, onDelete }: Props) {
  const length = route && route.length >= 2 ? pathLength(route) : 0;
  return (
    <section className="section route-panel">
      <div className="section-title">Planned route</div>
      <p className="hint">
        The way you mean listeners to walk, start to finish. It’s drawn on their map, and the AI
        assistant follows it when it places points.
      </p>

      {drawing ? (
        <div className="geo-status">
          <span>
            {draftLen} corner{draftLen === 1 ? '' : 's'} · click the map to trace the route,
            double-click to finish
          </span>
          <span className="row-actions">
            <button type="button" className="btn btn-ghost small" onClick={onUndo} disabled={draftLen === 0}>
              Undo
            </button>
            <button type="button" className="btn btn-accent small" onClick={onFinish} disabled={draftLen < 2}>
              Finish
            </button>
            <button type="button" className="btn btn-ghost small" onClick={onCancel}>
              Cancel
            </button>
          </span>
        </div>
      ) : route && route.length >= 2 ? (
        <>
          <p className="route-panel__stats">
            {distanceLabel(length)} · about {Math.max(1, Math.round(length / WALK_MPS / 60))} min at walking
            pace
          </p>
          <p className="hint">Drag the corners on the map to adjust it.</p>
          <div className="row-actions row-actions--wrap">
            <button type="button" className="btn btn-ghost small" onClick={() => onDraw(true)}>
              Continue drawing
            </button>
            <button type="button" className="btn btn-ghost small" onClick={() => onDraw(false)}>
              Redraw
            </button>
            <ConfirmButton className="btn btn-danger small" onConfirm={onDelete}>
              Delete route
            </ConfirmButton>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-accent small" onClick={() => onDraw(false)}>
          Draw the route
        </button>
      )}
    </section>
  );
}
