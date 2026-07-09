import type { FlightIssue } from '@audioworld/shared';

interface Props {
  publishedAt: string | null;
  dirty: boolean;
  issues: FlightIssue[];
  publishing: boolean;
  onPublish: () => void;
}

/** Publish/draft status + the pre-publish flight check (flag linter, dead URLs, geometry). */
export default function PublishBar({ publishedAt, dirty, issues, publishing, onPublish }: Props) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const blocked = errors.length > 0;

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

      {issues.length > 0 && (
        <ul className="flight">
          {errors.map((i, n) => (
            <li key={`e${n}`} className="flight__item flight__item--error">
              {i.message}
            </li>
          ))}
          {warnings.map((i, n) => (
            <li key={`w${n}`} className="flight__item flight__item--warn">
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
