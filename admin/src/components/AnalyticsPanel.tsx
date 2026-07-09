import type { AudioPoint, CourseAnalytics } from '@audioworld/shared';

interface Props {
  analytics: CourseAnalytics | null;
  points: AudioPoint[];
  loading: boolean;
}

/** Aggregate-only listener analytics: a reach funnel (the heatmap is drawn on the map). */
export default function AnalyticsPanel({ analytics, points, loading }: Props) {
  const sessions = analytics?.sessions ?? 0;
  const reached = analytics?.reached ?? {};
  const rows = points
    .map((p) => ({ name: p.name, count: reached[p.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <section className="section">
      <div className="section-title">
        Analytics{sessions > 0 ? ` · ${sessions} session${sessions === 1 ? '' : 's'}` : ''}
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : sessions === 0 ? (
        <p className="muted">
          No listener data yet. Anonymous and aggregate only — a heatmap of time spent (on
          the map) and how many sessions reached each point.
        </p>
      ) : (
        <ul className="funnel">
          {rows.map((r, i) => {
            const pct = Math.round((r.count / sessions) * 100);
            return (
              <li key={i} className="funnel__row">
                <span className="funnel__name" title={r.name}>
                  {r.name}
                </span>
                <span className="funnel__bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="funnel__pct">{pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
