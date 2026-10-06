import { useEffect, useRef, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { isValidSlug, MAX_SLUG_LENGTH } from '@audioworld/shared';
import ShareCourse, { clientBase } from './ShareCourse';

interface Props {
  course: Course;
  onUpdate: (id: string, patch: Partial<Course>) => void;
  /** Change the short address; resolves to an error message, or null when saved. */
  onSaveSlug: (id: string, slug: string) => Promise<string | null>;
  onExport: (id: string) => void;
  onImport: (file: File) => void;
  onDelete: (id: string) => void;
}

/**
 * Per-course configuration + lifecycle actions (listener options, sharing, backup,
 * delete). These are set occasionally, so they live in a collapsed section rather than
 * competing with the everyday authoring flow.
 */
export default function CourseSettings({ course, onUpdate, onSaveSlug, onExport, onImport, onDelete }: Props) {
  const importInput = useRef<HTMLInputElement | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slug, setSlug] = useState(course.slug ?? '');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSaving, setSlugSaving] = useState(false);
  useEffect(() => {
    setSlug(course.slug ?? '');
    setSlugError(null);
  }, [course.id, course.slug]);

  const slugChanged = slug !== (course.slug ?? '');
  const slugOk = isValidSlug(slug);
  const saveSlug = async () => {
    setSlugSaving(true);
    setSlugError(await onSaveSlug(course.id, slug));
    setSlugSaving(false);
  };

  return (
    <div className="course-settings">
      <label className="form-field">
        <span className="label">Short address</span>
        <div className="field-row">
          <span className="muted">{clientBase().replace(/^https?:\/\//, '')}/</span>
          <input
            className="input"
            value={slug}
            maxLength={MAX_SLUG_LENGTH}
            spellCheck={false}
            onChange={(e) => {
              setSlug(e.currentTarget.value.toLowerCase().replace(/\s+/g, '-'));
              setSlugError(null);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => void saveSlug()}
            disabled={!slugChanged || !slugOk || slugSaving}
          >
            {slugSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {slugChanged && !slugOk ? (
          <span className="field-hint">Lowercase a–z, digits and single hyphens, 2–{MAX_SLUG_LENGTH} characters.</span>
        ) : (
          <span className="field-hint">The link listeners use. Changing it breaks links and QR codes already shared.</span>
        )}
        {slugError && <div className="error">{slugError}</div>}
      </label>

      <div className="course-check">
        <label className="check">
          <input
            type="checkbox"
            checked={course.showStartWayfinding ?? false}
            onChange={(e) => onUpdate(course.id, { showStartWayfinding: e.currentTarget.checked })}
          />
          Show listeners the direction to the start point
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={course.eyesUp ?? false}
            onChange={(e) => onUpdate(course.id, { eyesUp: e.currentTarget.checked })}
          />
          Eyes-up mode (hide the screen, navigate by sonar ping)
        </label>
      </div>

      <div className="row-actions row-actions--wrap">
        <button type="button" className="btn btn-ghost small" onClick={() => setSharing((s) => !s)}>
          {sharing ? 'Hide share' : '🔗 Share link & QR'}
        </button>
        <button
          type="button"
          className="btn btn-ghost small"
          title="Download this course as a portable .audioworld file"
          onClick={() => onExport(course.id)}
        >
          ⭳ Export
        </button>
        <button
          type="button"
          className="btn btn-ghost small"
          title="Import a .audioworld course file as a new course"
          onClick={() => importInput.current?.click()}
        >
          ⭱ Import
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".audioworld,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) onImport(file);
            e.currentTarget.value = '';
          }}
        />
      </div>

      {sharing && (
        <ShareCourse
          courseId={course.id}
          courseName={course.name}
          courseSlug={course.slug}
          onClose={() => setSharing(false)}
        />
      )}

      {confirmDelete ? (
        <div className="confirm">
          <span>Delete this course and its points?</span>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger small"
              onClick={() => {
                onDelete(course.id);
                setConfirmDelete(false);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-danger small course-settings__delete"
          onClick={() => setConfirmDelete(true)}
        >
          Delete course
        </button>
      )}
    </div>
  );
}
