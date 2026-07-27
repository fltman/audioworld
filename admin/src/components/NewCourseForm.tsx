import { useState } from 'react';

interface Props {
  onCreate: (name: string, description: string) => void;
  onCancel: () => void;
}

/** Create a course from the inspector (opened by the top bar's "+ New"). */
export default function NewCourseForm({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onCreate(n, description.trim());
  };

  return (
    <section className="section form">
      <div className="section-title">New course</div>
      <label className="form-field">
        <span className="label">Name</span>
        <input
          className="input"
          autoFocus
          placeholder="Course name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </label>
      <label className="form-field">
        <span className="label">Description (optional)</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
      </label>
      <div className="actions">
        <button type="button" className="btn btn-accent" onClick={submit} disabled={!name.trim()}>
          Create
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
