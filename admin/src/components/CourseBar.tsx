import { useState } from 'react';
import type { Course } from '@audioworld/shared';
import ShareCourse from './ShareCourse';

interface Props {
  courses: Course[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Course>) => void;
}

export default function CourseBar({
  courses,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onUpdate,
}: Props) {
  const selected = courses.find((c) => c.id === selectedId) ?? null;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onCreate(n, description.trim());
    setName('');
    setDescription('');
    setCreating(false);
  };

  if (creating) {
    return (
      <section className="section">
        <div className="section-title">New course</div>
        <div className="inline-form">
          <input
            className="input"
            placeholder="Course name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <textarea
            className="textarea"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <div className="row-actions">
            <button type="button" className="btn btn-accent" onClick={submit} disabled={!name.trim()}>
              Create
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCreating(false);
                setName('');
                setDescription('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-title">Course</div>
      <div className="field-row">
        <select
          className="select"
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.currentTarget.value)}
          disabled={courses.length === 0}
        >
          {courses.length === 0 && <option value="">No courses yet</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-accent" onClick={() => setCreating(true)}>
          New
        </button>
      </div>

      {selected && (
        <label className="check course-check">
          <input
            type="checkbox"
            checked={selected.showStartWayfinding ?? false}
            onChange={(e) => onUpdate(selected.id, { showStartWayfinding: e.currentTarget.checked })}
          />
          Show listeners the direction to the start point
        </label>
      )}

      {selectedId && (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setSharing((s) => !s)}
          >
            {sharing ? 'Hide share' : 'Share link & QR'}
          </button>
          {!confirmDelete && (
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setConfirmDelete(true)}
            >
              Delete course
            </button>
          )}
        </div>
      )}

      {selectedId && sharing && (
        <ShareCourse
          courseId={selectedId}
          courseName={courses.find((c) => c.id === selectedId)?.name ?? 'course'}
          onClose={() => setSharing(false)}
        />
      )}

      {selectedId && confirmDelete && (
        <div className="confirm">
          <span>Delete this course and its points?</span>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger small"
              onClick={() => {
                onDelete(selectedId);
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
      )}
    </section>
  );
}
