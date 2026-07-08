import { useEffect, useState } from 'react';
import type { AudioPoint, Coordinates, Course, PointType, User } from '@audioworld/shared';
import { anchorOf } from '@audioworld/shared';
import { api, getToken, setToken } from './api';
import { freshDraft, pointToDraft, draftToInput, type DraftState } from './draft';
import { isPathType } from './pointTypes';
import CourseBar from './components/CourseBar';
import Toolbar from './components/Toolbar';
import PointForm from './components/PointForm';
import PointList from './components/PointList';
import PreviewPanel from './components/PreviewPanel';
import MapView from './components/MapView';
import Login from './components/Login';
import UsersPanel from './components/UsersPanel';
import SoundLibrary from './components/SoundLibrary';
import { PreviewEngine } from './services/previewEngine';

const LS_KEY = 'audioworld.admin.courseId';
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showSounds, setShowSounds] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [points, setPoints] = useState<AudioPoint[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewEngine | null>(null);

  const startPreview = async () => {
    const start = points[0] ? anchorOf(points[0]) : { lat: 59.3293, lng: 18.0686 };
    const engine = new PreviewEngine(points, start);
    await engine.start();
    setDraft(null);
    setPreview(engine);
  };

  const stopPreview = () => {
    preview?.dispose();
    setPreview(null);
  };

  // Keep the running playtest fed with the latest points; tear it down on unmount.
  useEffect(() => {
    preview?.setPoints(points);
  }, [points, preview]);
  useEffect(() => () => preview?.dispose(), [preview]);

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

  // Validate any stored token on load.
  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setAuthReady(true);
        return;
      }
      try {
        setUser(await api.me());
      } catch {
        setToken(null);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  // Once an authoring user is known, load their courses (admins see all, superusers their own).
  useEffect(() => {
    if (!user || user.role === 'basic') return;
    (async () => {
      try {
        const cs = await api.listCourses();
        setCourses(cs);
        const mine = user.role === 'admin' ? cs : cs.filter((c) => c.ownerId === user.id);
        const saved = localStorage.getItem(LS_KEY);
        const initial = mine.find((c) => c.id === saved)?.id ?? mine[0]?.id ?? null;
        if (initial) {
          setCourseId(initial);
          void loadPoints(initial);
        }
      } catch (e) {
        setError(msg(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const logout = () => {
    setToken(null);
    setUser(null);
    setShowUsers(false);
    setShowSounds(false);
    setPreview(null);
    setCourses([]);
    setCourseId(null);
    setPoints([]);
    setDraft(null);
  };

  const selectCourse = (id: string) => {
    if (!id || id === courseId) return;
    setPreview(null);
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

  // Resume adding vertices to an existing path (map clicks append to the end).
  const addPoints = () =>
    setDraft((d) => (d && isPathType(d.type) ? { ...d, drawingPath: true } : d));

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

  // Upload and return the URL (for per-stop clips on a path).
  const uploadFile = async (file: File): Promise<string | null> => {
    setUploading(true);
    setFormError(null);
    try {
      return (await api.uploadAudio(file)).url;
    } catch (e) {
      setFormError(msg(e));
      return null;
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
  const visibleCourses =
    user?.role === 'admin' ? courses : courses.filter((c) => c.ownerId === user?.id);

  if (!authReady) {
    return (
      <div className="app">
        <aside className="sidebar">
          <header className="brand">
            AudioWorld<span>Admin</span>
          </header>
          <p className="section muted">Loading…</p>
        </aside>
        <div className="mapwrap" />
      </div>
    );
  }
  if (!user) return <Login onAuthed={setUser} />;
  if (user.role === 'basic') {
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand" style={{ padding: 0 }}>
            AudioWorld<span>Admin</span>
          </div>
          <h2>No access yet</h2>
          <p className="muted">
            Signed in as {user.email}. Your account has no authoring access — ask an admin to grant
            you a role.
          </p>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          AudioWorld<span>Admin</span>
        </header>

        <div className="account">
          <span className="account__email" title={user.email}>
            {user.email}
          </span>
          <span className="account__role">{user.role}</span>
          {user.role === 'admin' && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setShowUsers((s) => !s);
                setShowSounds(false);
              }}
            >
              {showUsers ? 'Courses' : 'Users'}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setShowSounds((s) => !s);
              setShowUsers(false);
            }}
          >
            {showSounds ? 'Courses' : 'Sounds'}
          </button>
          <button type="button" className="icon-btn" onClick={logout}>
            Sign out
          </button>
        </div>

        {showUsers && user.role === 'admin' ? (
          <UsersPanel me={user} />
        ) : showSounds ? (
          <SoundLibrary />
        ) : (
          <>
        <CourseBar
          courses={visibleCourses}
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

        {courseId && preview ? (
          <PreviewPanel engine={preview} onStop={stopPreview} />
        ) : (
          courseId && (
            <>
              <button
                type="button"
                className="btn btn-accent playtest-btn"
                onClick={() => void startPreview()}
                disabled={points.length === 0}
              >
                &#9654; Playtest this course
              </button>
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
                  onUploadFile={uploadFile}
                  onFinishPath={finishPath}
                  onUndoVertex={undoVertex}
                  onAddPoints={addPoints}
                  saving={saving}
                  uploading={uploading}
                  error={formError}
                />
              ) : (
                <PointList points={points} onEdit={editPoint} onDelete={deletePoint} />
              )}
            </>
          )
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
        preview={preview}
      />
    </div>
  );
}
