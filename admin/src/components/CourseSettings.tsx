import { useEffect, useRef, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { isValidSlug, MAX_SLUG_LENGTH } from '@audioworld/shared';
import { absoluteAudioUrl, api } from '../api';
import ShareCourse, { clientBase } from './ShareCourse';

interface Props {
  course: Course;
  onUpdate: (id: string, patch: Partial<Course>) => void | Promise<void>;
  /** Change the short address; resolves to an error message, or null when saved. */
  onSaveSlug: (id: string, slug: string) => Promise<string | null>;
  onExport: (id: string) => void;
  onImport: (file: File) => void;
  onDelete: (id: string) => void;
}

type Details = Pick<Course, 'name' | 'description' | 'imageUrl' | 'idea' | 'backgroundInfo'>;
const detailsOf = (c: Course): { [K in keyof Details]-?: string } => ({
  name: c.name,
  description: c.description ?? '',
  imageUrl: c.imageUrl ?? '',
  idea: c.idea ?? '',
  backgroundInfo: c.backgroundInfo ?? '',
});

/**
 * What the walk is: the name, description and cover listeners see on its start page,
 * plus the author's notes on its idea and background — which also brief the AI assistant.
 */
function CourseDetails({ course, onUpdate }: Pick<Props, 'course' | 'onUpdate'>) {
  const [form, setForm] = useState(() => detailsOf(course));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setForm(detailsOf(course));
    setError(null);
  }, [course]);

  const stored = detailsOf(course);
  const dirty = (Object.keys(form) as (keyof Details)[]).some((k) => form[k] !== stored[k]);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      set({ imageUrl: (await api.uploadImage(file)).url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onUpdate(course.id, { ...form, name: form.name.trim() });
    setSaving(false);
    setSaved(true);
  };

  return (
    <section className="section course-details">
      <div className="section-title">About this walk</div>

      <label className="form-field">
        <span className="label">Name</span>
        <input className="input" value={form.name} onChange={(e) => set({ name: e.currentTarget.value })} />
      </label>

      <label className="form-field">
        <span className="label">Description</span>
        <textarea
          className="textarea"
          rows={4}
          value={form.description}
          onChange={(e) => set({ description: e.currentTarget.value })}
        />
        <span className="field-hint">Listeners read this on the walk’s start page.</span>
      </label>

      <div className="form-field">
        <span className="label">Cover image</span>
        {form.imageUrl ? (
          <img className="course-details__cover" src={absoluteAudioUrl(form.imageUrl)} alt="" />
        ) : (
          <div className="course-details__cover course-details__cover--empty">No cover image</div>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-ghost small"
            disabled={uploading}
            onClick={() => imageInput.current?.click()}
          >
            {uploading ? 'Uploading…' : form.imageUrl ? 'Replace…' : 'Upload…'}
          </button>
          {form.imageUrl && (
            <button type="button" className="btn btn-ghost small" onClick={() => set({ imageUrl: '' })}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void uploadCover(file);
            e.currentTarget.value = '';
          }}
        />
        <span className="field-hint">Shown at the top of the start page. Landscape works best.</span>
      </div>

      <label className="form-field">
        <span className="label">The idea</span>
        <textarea
          className="textarea"
          rows={4}
          placeholder="Premise, mood, the story’s arc, who it’s for…"
          value={form.idea}
          onChange={(e) => set({ idea: e.currentTarget.value })}
        />
      </label>

      <label className="form-field">
        <span className="label">Background</span>
        <textarea
          className="textarea"
          rows={5}
          placeholder="History, facts, people and sources the walk draws on…"
          value={form.backgroundInfo}
          onChange={(e) => set({ backgroundInfo: e.currentTarget.value })}
        />
        <span className="field-hint">Your notes — never shown to listeners. The AI assistant reads them.</span>
      </label>

      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent small"
          disabled={!dirty || saving || !form.name.trim()}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty && <span className="muted">Saved ✓</span>}
      </div>
    </section>
  );
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
    <>
      <CourseDetails course={course} onUpdate={onUpdate} />
      <section className="section course-settings">
        <div className="section-title">Listening &amp; sharing</div>
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
      </section>
    </>
  );
}
