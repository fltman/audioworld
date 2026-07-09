import { useState } from 'react';
import type { Course } from '@audioworld/shared';

interface Props {
  courses: Course[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string) => void;
}

/** The course picker + create flow. Per-course settings/actions live in CourseSettings. */
export default function CourseBar({ courses, selectedId, onSelect, onCreate }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

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
          + New
        </button>
      </div>
    </section>
  );
}
