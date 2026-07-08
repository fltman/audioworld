import { useEffect, useState } from 'react';
import type { AudioPoint, Coordinates, Course, PointType } from '@audioworld/shared';
import { api } from './api';
import { freshDraft, pointToDraft, draftToInput, type DraftState } from './draft';
import { isPathType } from './pointTypes';
import CourseBar from './components/CourseBar';
import Toolbar from './components/Toolbar';
import PointForm from './components/PointForm';
import PointList from './components/PointList';
import MapView from './components/MapView';

const LS_KEY = 'audioworld.admin.courseId';
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [points, setPoints] = useState<AudioPoint[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadPoints = async (id: string) => {
    try {
      setPoints(await api.listPoints(id));
    } catch (e) {
      setError(msg(e));
      setPoints([]);
    } finally {
      setFitToken((t) => t + 1);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const cs = await api.listCourses();
        setCourses(cs);
        const saved = localStorage.getItem(LS_KEY);
        const initial = cs.find((c) => c.id === saved)?.id ?? cs[0]?.id ?? null;
        if (initial) {
          setCourseId(initial);
          void loadPoints(initial);
        }
      } catch (e) {
        setError(msg(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCourse = (id: string) => {
    if (!id || id === courseId) return;
    setCourseId(id);
    localStorage.setItem(LS_KEY, id);
    setDraft(null);
    setFormError(null);
    setPoints([]);
    void loadPoints(id);
  };

  const createCourse = async (name: string, description: string) => {
    try {
      const c = await api.createCourse({ name, description: description || undefined });
      setCourses((prev) => [...prev, c]);
      selectCourse(c.id);
    } catch (e) {
      setError(msg(e));
    }
  };

  const deleteCourse = async (id: string) => {
    try {
      await api.deleteCourse(id);
      const remaining = courses.filter((c) => c.id !== id);
      setCourses(remaining);
      setDraft(null);
      const next = remaining[0]?.id ?? null;
      setCourseId(next);
      if (next) {
        localStorage.setItem(LS_KEY, next);
        setPoints([]);
        void loadPoints(next);
      } else {
        localStorage.removeItem(LS_KEY);
        setPoints([]);
        setFitToken((t) => t + 1);
      }
    } catch (e) {
      setError(msg(e));
    }
  };

  const pickType = (t: PointType) => {
    if (!courseId) return;
    setFormError(null);
    setDraft(freshDraft(t, courseId));
  };

  const cancelDraft = () => {
    setDraft(null);
    setFormError(null);
  };

  const mapClick = (coord: Coordinates) =>
    setDraft((d) => {
      if (!d) return d;
      if (isPathType(d.type)) return d.drawingPath ? { ...d, path: [...d.path, coord] } : d;
      return { ...d, center: coord };
    });

  const mapDblClick = () =>
    setDraft((d) =>
      d && isPathType(d.type) && d.drawingPath && d.path.length >= 2
        ? { ...d, drawingPath: false }
        : d
    );

  const finishPath = () =>
    setDraft((d) =>
      d && isPathType(d.type) && d.path.length >= 2 ? { ...d, drawingPath: false } : d
    );

  const undoVertex = () =>
    setDraft((d) => (d && d.path.length > 0 ? { ...d, path: d.path.slice(0, -1) } : d));

  const anchorDrag = (coord: Coordinates) =>
    setDraft((d) => (d ? { ...d, center: coord } : d));

  const pathVertexDrag = (i: number, coord: Coordinates) =>
    setDraft((d) => {
      if (!d) return d;
      const path = [...d.path];
      path[i] = coord;
      return { ...d, path };
    });

  const selectPoint = (id: string) => {
    if (draft?.drawingPath) return;
    editPoint(id);
  };

  const editPoint = (id: string) => {
    const p = points.find((x) => x.id === id);
    if (!p) return;
    setFormError(null);
    setDraft(pointToDraft(p));
  };

  const deletePoint = async (id: string) => {
    try {
      await api.deletePoint(id);
      setPoints((prev) => prev.filter((p) => p.id !== id));
      setDraft((d) => (d?.editingId === id ? null : d));
    } catch (e) {
      setError(msg(e));
    }
  };

  const uploadAudio = async (file: File) => {
    setUploading(true);
    setFormError(null);
    try {
      const res = await api.uploadAudio(file);
      setDraft((d) =>
        d ? { ...d, audio: { kind: 'upload', url: res.url, title: file.name } } : d
      );
    } catch (e) {
      setFormError(msg(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const result = draftToInput(draft);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (draft.editingId) {
        const updated = await api.updatePoint(draft.editingId, result.input);
        setPoints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await api.createPoint(draft.courseId, result.input);
        setPoints((prev) => [...prev, created]);
      }
      setDraft(null);
    } catch (e) {
      setFormError(msg(e));
    } finally {
      setSaving(false);
    }
  };

  const activeType = draft?.type ?? null;
  const placing = !!draft && draft.editingId === null;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          AudioWorld<span>Admin</span>
        </header>

        <CourseBar
          courses={courses}
          selectedId={courseId}
          onSelect={selectCourse}
          onCreate={createCourse}
          onDelete={deleteCourse}
        />

        {error && (
          <div className="banner">
            <span>{error}</span>
            <button type="button" className="icon-btn" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {courseId && (
          <>
            <Toolbar
              activeType={activeType}
              placing={placing}
              disabled={false}
              onPick={pickType}
              onCancel={cancelDraft}
            />
            {draft ? (
              <PointForm
                draft={draft}
                onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                onSave={save}
                onCancel={cancelDraft}
                onDelete={() => draft.editingId && void deletePoint(draft.editingId)}
                onUpload={uploadAudio}
                onFinishPath={finishPath}
                onUndoVertex={undoVertex}
                saving={saving}
                uploading={uploading}
                error={formError}
              />
            ) : (
              <PointList points={points} onEdit={editPoint} onDelete={deletePoint} />
            )}
          </>
        )}
      </aside>

      <MapView
        points={points}
        draft={draft}
        fitToken={fitToken}
        onMapClick={mapClick}
        onMapDblClick={mapDblClick}
        onAnchorDrag={anchorDrag}
        onPathVertexDrag={pathVertexDrag}
        onSelectPoint={selectPoint}
      />
    </div>
  );
}
