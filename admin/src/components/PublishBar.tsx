import { useState } from 'react';
import type { FlightIssue } from '@audioworld/shared';
import ShareCourse from './ShareCourse';

interface Props {
  courseId: string;
  courseName: string;
  publishedAt: string | null;
  dirty: boolean;
  issues: FlightIssue[];
  publishing: boolean;
  onPublish: () => void;
  /** Jump to the point an issue refers to (opens its form, centres the map). */
  onFixIssue: (pointId: string) => void;
}

/** Publish/draft status + the pre-publish flight check (flag linter, dead URLs, geometry). */
export default function PublishBar({
  courseId,
  courseName,
  publishedAt,
  dirty,
  issues,
  publishing,
  onPublish,
  onFixIssue,
}: Props) {
  const [sharing, setSharing] = useState(false);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const blocked = errors.length > 0;

  const renderIssue = (i: FlightIssue, key: string, cls: string) =>
    i.pointId ? (
      <li key={key} className={`flight__item ${cls}`}>
        <button type="button" className="flight__fix" onClick={() => onFixIssue(i.pointId!)}>
          {i.message}
        </button>
      </li>
    ) : (
      <li key={key} className={`flight__item ${cls}`}>
        {i.message}
      </li>
    );

  return (
    <section className="section publish">
      <div className="publish__head">
        <div className="publish__status">
          {!publishedAt ? (
            <span className="publish__pill publish__pill--draft">Never published</span>
          ) : dirty ? (
            <span className="publish__pill publish__pill--dirty">Unpublished changes</span>
          ) : (
            <span className="publish__pill publish__pill--live">Published</span>
          )}
          {publishedAt && (
            <span className="publish__when">{new Date(publishedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="row-actions">
          {publishedAt && (
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setSharing((s) => !s)}
              title="Get the listener link & QR code"
            >
              {sharing ? 'Hide share' : '🔗 Share'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-accent"
            onClick={onPublish}
            disabled={publishing || blocked || (!dirty && !!publishedAt)}
            title={blocked ? 'Fix the flight-check errors first' : undefined}
          >
            {publishing ? 'Publishing…' : publishedAt ? 'Publish changes' : 'Publish'}
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="flight">
          {errors.map((i, n) => renderIssue(i, `e${n}`, 'flight__item--error'))}
          {warnings.map((i, n) => renderIssue(i, `w${n}`, 'flight__item--warn'))}
        </ul>
      )}

      {publishedAt && sharing && (
        <ShareCourse courseId={courseId} courseName={courseName} onClose={() => setSharing(false)} />
      )}
    </section>
  );
}
