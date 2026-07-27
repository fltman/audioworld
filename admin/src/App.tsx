import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AcousticZone,
  AudioPoint,
  AudioPointInput,
  Character,
  Coordinates,
  BBox,
  Course,
  CourseAnalytics,
  DiscoveredPlace,
  PointType,
  ScoutSet,
  ScoutWaypoint,
  SyncMode,
  User,
} from '@audioworld/shared';
import { anchorOf, flightCheck } from '@audioworld/shared';
import { api, getToken, setToken } from './api';
import { freshDraft, pointToDraft, draftToInput, type DraftState } from './draft';
import { isPathType } from './pointTypes';
import NewCourseForm from './components/NewCourseForm';
import Toolbar from './components/Toolbar';
import PointForm from './components/PointForm';
import PointList from './components/PointList';
import PreviewPanel from './components/PreviewPanel';
import MapView from './components/MapView';
import Login from './components/Login';
import UsersPanel from './components/UsersPanel';
import SoundLibrary from './components/SoundLibrary';
import CharacterManager from './components/CharacterManager';
import BulkBar from './components/BulkBar';
import CourseSettings from './components/CourseSettings';
import DiscoverPanel from './components/DiscoverPanel';
import ScoutConvertPanel from './components/ScoutConvertPanel';
import ZonePanel from './components/ZonePanel';
import PublishBar from './components/PublishBar';
import AnalyticsPanel from './components/AnalyticsPanel';
import { PreviewEngine } from './services/previewEngine';

const LS_KEY = 'audioworld.admin.courseId';
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Which utility panel the right inspector shows when you're not editing a point. */
type Tool = 'zones' | 'discover' | 'scout' | 'analytics' | 'bulk' | 'settings' | 'new-course' | null;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<'courses' | 'sounds' | 'users'>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [points, setPoints] = useState<AudioPoint[]>([]);
  const [zones, setZones] = useState<AcousticZone[]>([]);
  const [zoneDraft, setZoneDraft] = useState<Coordinates[] | null>(null);
  const [savingZones, setSavingZones] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [scoutSets, setScoutSets] = useState<ScoutSet[]>([]);
  const [scoutId, setScoutId] = useState<string | null>(null);
  const [scoutWaypoints, setScoutWaypoints] = useState<ScoutWaypoint[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [discoverBbox, setDiscoverBbox] = useState<BBox | null>(null);
  const [discoverPlaces, setDiscoverPlaces] = useState<DiscoveredPlace[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<number[]>([]);
  const [converting, setConverting] = useState<{ done: number; total: number } | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [tool, setTool] = useState<Tool>(null);
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
    setTool(null);
    setPreview(engine);
  };

  const stopPreview = () => {
    preview?.dispose();
    setPreview(null);
  };

  // Keep the running playtest fed with the latest points + zones; tear it down on unmount.
  useEffect(() => {
    preview?.setPoints(points);
    preview?.setZones(zones);
  }, [points, zones, preview]);
  useEffect(() => () => preview?.dispose(), [preview]);

  // Monotonic token so a slow listPoints response for a previously-selected course
  // can't clobber the points of the course the user has since switched to.
  const loadReqRef = useRef(0);
  const loadPoints = async (id: string) => {
    const token = ++loadReqRef.current;
    try {
      const pts = await api.listPoints(id);
      if (token !== loadReqRef.current) return; // superseded by a newer selection
      setPoints(pts);
    } catch (e) {
      if (token !== loadReqRef.current) return;
      setError(msg(e));
      setPoints([]);
    } finally {
      if (token === loadReqRef.current) setFitToken((t) => t + 1);
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
      // Scout sets for the reference-layer picker (best-effort).
      try {
        setScoutSets(await api.listScouts());
      } catch {
        /* ignore — reference layers just won't be offered */
      }
      // Characters for the guide picker (best-effort).
      try {
        setCharacters(await api.listCharacters());
      } catch {
        /* ignore — the guide dropdown just stays empty */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const selectScout = async (id: string) => {
    setScoutId(id || null);
    if (!id) {
      setScoutWaypoints([]);
      return;
    }
    try {
      const set = await api.getScout(id);
      setScoutWaypoints(set.waypoints);
    } catch (e) {
      setError(msg(e));
    }
  };

  const togglePlace = (i: number) =>
    setSelectedPlaces((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // Greedy nearest-neighbour ordering from the first place — a sensible walking route.
  const orderRoute = (places: DiscoveredPlace[]): DiscoveredPlace[] => {
    if (places.length < 3) return places;
    const remaining = [...places];
    const route = [remaining.shift()!];
    while (remaining.length) {
      const last = route[route.length - 1]!;
      let bi = 0;
      let bd = Infinity;
      remaining.forEach((p, i) => {
        const d = (p.lat - last.lat) ** 2 + (p.lng - last.lng) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      route.push(remaining.splice(bi, 1)[0]!);
    }
    return route;
  };

  // Add selected discovered places as silent static points carrying their facts (voiced
  // later in the editor — no TTS here). "route" just orders them for a sensible walk.
  const runConvert = async (mode: 'individual' | 'route') => {
    if (!courseId) return;
    let chosen = selectedPlaces
      .map((i) => discoverPlaces[i])
      .filter((p): p is DiscoveredPlace => !!p);
    if (chosen.length === 0) return;
    if (mode === 'route') chosen = orderRoute(chosen);
    setConverting({ done: 0, total: chosen.length });
    setError(null);
    const created: AudioPoint[] = [];
    const converted = new Set<DiscoveredPlace>();
    try {
      for (const p of chosen) {
        // Add each place as a silent point that carries its facts; you voice it later
        // (optionally with a persona) in the point editor. No TTS / credits spent here.
        const facts = [p.description, p.wikipedia ? `Wikipedia: ${p.wikipedia}` : '']
          .filter(Boolean)
          .join('\n');
        const input: AudioPointInput = {
          courseId,
          name: p.name,
          type: 'static',
          center: { lat: p.lat, lng: p.lng },
          radius: 30,
          audio: { kind: 'url', url: '', title: p.name, ...(facts ? { description: facts } : {}) },
          playback: { loop: false, stopAfter: false, reload: true },
          volume: 1,
          sync: 'individual',
        };
        created.push(await api.createPoint(courseId, input));
        converted.add(p); // record success BEFORE moving on
        setConverting((c) => (c ? { ...c, done: c.done + 1 } : null));
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      if (created.length) setPoints((prev) => [...prev, ...created]);
      // Drop the places we actually added (even on a partial failure) so a retry only
      // re-runs the remainder.
      setDiscoverPlaces((prev) => prev.filter((p) => !converted.has(p)));
      setSelectedPlaces([]); // indices are stale after filtering; user re-selects the rest
      setConverting(null);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTab('courses');
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
    setSelectedIds([]);
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

  const exportCourse = async (id: string) => {
    try {
      const blob = await api.exportCourse(id);
      const course = courses.find((c) => c.id === id);
      const safe = (course?.name || 'course').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'course';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.audioworld`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(msg(e));
    }
  };

  const importCourse = async (file: File) => {
    try {
      const c = await api.importCourse(file);
      setCourses((prev) => [...prev, c]);
      selectCourse(c.id);
    } catch (e) {
      setError(msg(e));
    }
  };

  const updateCourse = async (id: string, patch: Partial<Course>) => {
    const current = courses.find((c) => c.id === id);
    if (!current) return;
    try {
      const updated = await api.updateCourse(id, {
        name: patch.name ?? current.name,
        description: patch.description ?? current.description,
        showStartWayfinding: patch.showStartWayfinding ?? current.showStartWayfinding ?? false,
        eyesUp: patch.eyesUp ?? current.eyesUp ?? false,
        // Only send zones when this update is actually about zones (saveZones); otherwise
        // omit them so the server COALESCE keeps its saved set and unsaved edits aren't
        // overwritten with a stale copy from `courses`.
        ...(patch.zones !== undefined ? { zones: patch.zones } : {}),
      });
      setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      setError(msg(e));
    }
  };

  // Load the zone editor from the selected course ONCE per selection — when the course
  // id changes, or when its data first arrives. Don't re-clobber live/unsaved zone edits
  // when `courses` updates for an unrelated reason (e.g. a course PUT elsewhere).
  const loadedZonesFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedZonesFor.current === courseId) return;
    const c = courses.find((x) => x.id === courseId);
    if (!c && courseId) return; // course data not loaded yet — wait for it
    loadedZonesFor.current = courseId;
    setZones(c?.zones ?? []);
    setZoneDraft(null);
  }, [courseId, courses]);

  const finishZone = () => {
    if (zoneDraft && zoneDraft.length >= 3) {
      setZones((z) => [
        ...z,
        { id: crypto.randomUUID(), name: `Zone ${z.length + 1}`, polygon: zoneDraft, reverb: 'room', wet: 0.5 },
      ]);
    }
    setZoneDraft(null);
  };
  const saveZones = async () => {
    if (!courseId) return;
    setSavingZones(true);
    await updateCourse(courseId, { zones });
    setSavingZones(false);
  };

  const publishCourse = async () => {
    if (!courseId) return;
    setPublishing(true);
    try {
      const updated = await api.publishCourse(courseId);
      setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)));
    } catch (e) {
      setError(msg(e));
    }
    setPublishing(false);
  };

  // Fetch the aggregate analytics only while the panel is open.
  useEffect(() => {
    if (!showAnalytics || !courseId) {
      setAnalytics(null);
      return;
    }
    let alive = true;
    setAnalyticsLoading(true);
    api
      .getAnalytics(courseId)
      .then((a) => alive && setAnalytics(a))
      .catch((e) => alive && setError(msg(e)))
      .finally(() => alive && setAnalyticsLoading(false));
    return () => {
      alive = false;
    };
  }, [showAnalytics, courseId]);

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
    setTool(null); // editing a point takes over the inspector
    setDraft(freshDraft(t, courseId));
  };

  // Open a utility panel in the inspector, toggling it off if already open. Editing a
  // point and running a tool are mutually exclusive, so switching clears the other.
  const pickTool = (t: Exclude<Tool, null>) => {
    const next = tool === t ? null : t;
    setDraft(null);
    setFormError(null);
    if (next !== 'zones') setZoneDraft(null);
    setMultiSelectMode(next === 'bulk');
    setShowAnalytics(next === 'analytics');
    setTool(next);
  };

  const cancelDraft = () => {
    setDraft(null);
    setFormError(null);
  };

  const mapClick = (coord: Coordinates) => {
    // While drawing a zone, map clicks lay down polygon corners.
    if (zoneDraft != null) {
      setZoneDraft((d) => [...(d ?? []), coord]);
      return;
    }
    setDraft((d) => {
      if (!d) return d;
      if (isPathType(d.type)) return d.drawingPath ? { ...d, path: [...d.path, coord] } : d;
      return { ...d, center: coord };
    });
  };

  const mapDblClick = () => {
    if (zoneDraft != null) {
      finishZone();
      return;
    }
    setDraft((d) =>
      d && isPathType(d.type) && d.drawingPath && d.path.length >= 2
        ? { ...d, drawingPath: false }
        : d
    );
  };

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
    setTool(null); // editing a point takes over the inspector
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

  // --- Multi-select: clone / delete / bulk-edit a group of points -----------
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const setMultiSelectMode = (on: boolean) => {
    setMultiSelect(on);
    if (!on) setSelectedIds([]);
    else setDraft(null); // leave single-edit so map clicks toggle selection instead
  };

  // A cloned point: same settings, offset ~18 m so the copy is visible, name suffixed.
  const clonedInput = (p: AudioPoint): AudioPointInput | null => {
    const r = draftToInput(pointToDraft(p));
    if ('error' in r) return null;
    const input = r.input;
    input.name = `${input.name} copy`;
    const off = (c: Coordinates): Coordinates => ({ lat: c.lat - 0.00016, lng: c.lng + 0.00016 });
    if (input.type === 'static' || input.type === 'static_circling' || input.type === 'follow_user') {
      input.center = off(input.center);
    } else {
      input.path = input.path.map(off);
    }
    return input;
  };

  const selectedPoints = (): AudioPoint[] =>
    selectedIds.map((id) => points.find((p) => p.id === id)).filter((p): p is AudioPoint => !!p);

  const cloneSelected = async () => {
    setBulkBusy(true);
    try {
      const created: AudioPoint[] = [];
      for (const p of selectedPoints()) {
        const input = clonedInput(p);
        if (input) created.push(await api.createPoint(p.courseId, input));
      }
      setPoints((prev) => [...prev, ...created]);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteSelected = async () => {
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      await Promise.all(ids.map((id) => api.deletePoint(id)));
      const gone = new Set(ids);
      setPoints((prev) => prev.filter((p) => !gone.has(p.id)));
      setSelectedIds([]);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBulkBusy(false);
    }
  };

  // Push one property onto every selected point (via the proven draft round-trip).
  const bulkPatch = async (patch: (input: AudioPointInput) => void) => {
    setBulkBusy(true);
    try {
      const updated: AudioPoint[] = [];
      for (const p of selectedPoints()) {
        const r = draftToInput(pointToDraft(p));
        if ('error' in r) continue;
        patch(r.input);
        updated.push(await api.updatePoint(p.id, r.input));
      }
      const byId = new Map(updated.map((u) => [u.id, u]));
      setPoints((prev) => prev.map((p) => byId.get(p.id) ?? p));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkVolume = (v: number) => bulkPatch((input) => (input.volume = v));
  const bulkSync = (mode: SyncMode) => bulkPatch((input) => (input.sync = mode));

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

  // Publish state: flight-check the live draft, and flag whether it has changed since
  // the last publish (any point/course edit newer than publishedAt).
  const currentCourse = courses.find((c) => c.id === courseId) ?? null;
  const publishedAt = currentCourse?.publishedAt ?? null;
  const flightIssues = useMemo(() => flightCheck(points, zones), [points, zones]);
  const dirty =
    !publishedAt ||
    (currentCourse ? currentCourse.updatedAt > publishedAt : false) ||
    points.some((p) => p.updatedAt > publishedAt);
  // Whether the local zone edits differ from what's saved on the course — drives the
  // "Save zone changes" button (which must stay available even when the last zone is
  // deleted, so an empty set can be persisted).
  const zonesDirty = useMemo(
    () => JSON.stringify(zones) !== JSON.stringify(currentCourse?.zones ?? []),
    [zones, currentCourse]
  );

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

  const inCourses = tab === 'courses';
  const hasInspector = inCourses && !!courseId && (!!preview || !!draft || !!tool);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          AudioWorld<span>Admin</span>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={`tab${tab === 'courses' ? ' is-active' : ''}`}
            onClick={() => setTab('courses')}
          >
            Courses
          </button>
          <button
            type="button"
            className={`tab${tab === 'sounds' ? ' is-active' : ''}`}
            onClick={() => setTab('sounds')}
          >
            Sounds
          </button>
          {user.role === 'admin' && (
            <button
              type="button"
              className={`tab${tab === 'users' ? ' is-active' : ''}`}
              onClick={() => setTab('users')}
            >
              Users
            </button>
          )}
        </nav>

        {inCourses && (
          <div className="topbar__course">
            <select
              className="select topbar__select"
              value={courseId ?? ''}
              onChange={(e) => selectCourse(e.currentTarget.value)}
            >
              {!courseId && <option value="">Select a course…</option>}
              {visibleCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`btn small ${tool === 'new-course' ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => pickTool('new-course')}
            >
              + New
            </button>
            {courseId && (
              <button
                type="button"
                className="btn btn-accent small"
                onClick={() => (preview ? stopPreview() : void startPreview())}
                disabled={!preview && points.length === 0}
              >
                {preview ? '■ Stop' : '▶ Playtest'}
              </button>
            )}
          </div>
        )}

        <div className="topbar__account">
          <span className="account__email" title={user.email}>
            {user.email}
          </span>
          <span className="account__role">{user.role}</span>
          <button type="button" className="icon-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="banner">
          <span>{error}</span>
          <button type="button" className="icon-btn" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="workspace">
        {tab === 'users' && user.role === 'admin' ? (
          <div className="workspace-panel">
            <UsersPanel me={user} />
          </div>
        ) : tab === 'sounds' ? (
          <div className="workspace-panel">
            <SoundLibrary />
            <CharacterManager characters={characters} onChange={setCharacters} />
          </div>
        ) : (
          <>
            <aside className="sidebar">
              {!courseId ? (
                <p className="section muted">Pick a course above, or create one with “+ New”.</p>
              ) : preview ? (
                <p className="section muted">Playtesting — use the controls on the right.</p>
              ) : (
                <>
                  {courseId && currentCourse && (
                    <PublishBar
                      courseId={courseId}
                      courseName={currentCourse.name}
                      publishedAt={publishedAt}
                      dirty={dirty}
                      issues={flightIssues}
                      publishing={publishing}
                      onPublish={publishCourse}
                      onFixIssue={(id) => {
                        editPoint(id);
                        setFitToken((t) => t + 1);
                      }}
                    />
                  )}
                  <Toolbar
                    activeType={activeType}
                    placing={placing}
                    disabled={false}
                    onPick={pickType}
                    onCancel={cancelDraft}
                  />
                  <div className="section tool-row">
                    <span className="label">Tools</span>
                    <div className="tool-row__grid">
                      <button
                        type="button"
                        className={`btn small ${tool === 'zones' || zoneDraft != null ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('zones')}
                      >
                        🔊 Zones ({zones.length})
                      </button>
                      <button
                        type="button"
                        className={`btn small ${tool === 'discover' ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('discover')}
                      >
                        🔍 Discover
                      </button>
                      <button
                        type="button"
                        className={`btn small ${tool === 'scout' ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('scout')}
                      >
                        📍 Scout
                      </button>
                      <button
                        type="button"
                        className={`btn small ${showAnalytics ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('analytics')}
                      >
                        📊 Analytics
                      </button>
                      <button
                        type="button"
                        className={`btn small ${multiSelect ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('bulk')}
                        title="Select several points to clone, delete or bulk-edit"
                      >
                        ☑ Multi-select
                      </button>
                      <button
                        type="button"
                        className={`btn small ${tool === 'settings' ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => pickTool('settings')}
                      >
                        ⚙️ Settings
                      </button>
                    </div>
                  </div>
                  <PointList
                    points={points}
                    onEdit={editPoint}
                    onDelete={deletePoint}
                    editingId={draft?.editingId ?? null}
                  />
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
              multiSelect={multiSelect}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              preview={preview}
              zones={zones}
              zoneDraft={zoneDraft}
              drawingZone={zoneDraft != null}
              analyticsCells={showAnalytics ? analytics?.cells : undefined}
              scoutWaypoints={scoutWaypoints}
              onViewport={setDiscoverBbox}
              discoverPlaces={discoverPlaces}
              selectedPlaces={selectedPlaces}
              onTogglePlace={togglePlace}
            />

            {hasInspector && (
              <aside className="inspector">
                {preview ? (
                  <PreviewPanel engine={preview} onStop={stopPreview} />
                ) : draft ? (
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
                    characters={characters}
                    saving={saving}
                    uploading={uploading}
                    error={formError}
                  />
                ) : tool === 'new-course' ? (
                  <NewCourseForm
                    onCreate={(name, description) => {
                      void createCourse(name, description);
                      setTool(null);
                    }}
                    onCancel={() => setTool(null)}
                  />
                ) : tool === 'zones' ? (
                  <ZonePanel
                    zones={zones}
                    drawing={zoneDraft != null}
                    draftLen={zoneDraft?.length ?? 0}
                    saving={savingZones}
                    dirty={zonesDirty}
                    onNew={() => setZoneDraft([])}
                    onFinish={finishZone}
                    onCancel={() => setZoneDraft(null)}
                    onUpdate={(i, patch) =>
                      setZones((z) => z.map((zz, idx) => (idx === i ? { ...zz, ...patch } : zz)))
                    }
                    onDelete={(i) => setZones((z) => z.filter((_, idx) => idx !== i))}
                    onSave={saveZones}
                  />
                ) : tool === 'discover' ? (
                  <DiscoverPanel
                    bbox={discoverBbox}
                    places={discoverPlaces}
                    selected={selectedPlaces}
                    onResults={(ps) => {
                      setDiscoverPlaces(ps);
                      setSelectedPlaces([]);
                    }}
                    onToggle={togglePlace}
                    onSelectAll={() => setSelectedPlaces(discoverPlaces.map((_, i) => i))}
                    onClear={() => setSelectedPlaces([])}
                    onConvert={(mode) => void runConvert(mode)}
                    converting={converting}
                  />
                ) : tool === 'scout' ? (
                  <section className="section">
                    <div className="section-title">Scout layer</div>
                    <select
                      className="select"
                      value={scoutId ?? ''}
                      onChange={(e) => void selectScout(e.currentTarget.value)}
                    >
                      <option value="">None</option>
                      {scoutSets.map((s) => (
                        <option key={s.id} value={s.id}>
                          📍 {s.name} ({s.waypoints.length})
                        </option>
                      ))}
                    </select>
                    <p className="hint">
                      Waypoints + notes you captured in the field (on your phone at{' '}
                      <code>/?scout</code>) appear on the map. Turn them into narrated points below.
                    </p>
                    {scoutId && (
                      <ScoutConvertPanel
                        key={scoutId}
                        waypoints={scoutWaypoints}
                        courseId={courseId}
                        onPointsCreated={(pts) => setPoints((prev) => [...prev, ...pts])}
                      />
                    )}
                  </section>
                ) : tool === 'analytics' ? (
                  <AnalyticsPanel analytics={analytics} points={points} loading={analyticsLoading} />
                ) : tool === 'settings' && currentCourse ? (
                  <CourseSettings
                    course={currentCourse}
                    onUpdate={updateCourse}
                    onExport={exportCourse}
                    onImport={importCourse}
                    onDelete={deleteCourse}
                  />
                ) : tool === 'bulk' ? (
                  <BulkBar
                    count={selectedIds.length}
                    total={points.length}
                    busy={bulkBusy}
                    onSelectAll={() => setSelectedIds(points.map((p) => p.id))}
                    onClear={() => setSelectedIds([])}
                    onClone={() => void cloneSelected()}
                    onDelete={() => void deleteSelected()}
                    onBulkVolume={(v) => void bulkVolume(v)}
                    onBulkSync={(m) => void bulkSync(m)}
                  />
                ) : null}
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  );
}
