import { useEffect, useState } from 'react';
import type { AudioPoint, Course } from '@audioworld/shared';
import { getPublished } from '../api';
import { ExperienceEngine, type RunSnapshot } from '../services/experience';
import { clearRun, readResumable, runKey } from '../services/runStore';
import { isSecureEnough } from '../services/geolocation';
import { StartMap } from '../components/StartMap';
import { playTestTone } from '../services/testTone';
import {
  downloadPack,
  offlineSupported,
  packEstimate,
  packMeta,
  removePack,
  type PackMeta,
  type PackProgress,
} from '../services/offline';

interface StartGateProps {
  courseId: string;
  course: Course | null;
  preferSim: boolean;
  onReady: (engine: ExperienceEngine, sim: boolean, course: Course) => void;
  onBack: () => void;
}

/**
 * The gate exists to capture a real user gesture: only from here may we create the
 * AudioContext, request the compass permission and start geolocation.
 */
export function StartGate({ courseId, course: initialCourse, preferSim, onReady, onBack }: StartGateProps) {
  const [course, setCourse] = useState<Course | null>(initialCourse);
  const [points, setPoints] = useState<AudioPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [pack, setPack] = useState<PackMeta | null>(() => packMeta(courseId));
  const [downloading, setDownloading] = useState<PackProgress | null>(null);
  const [resumable, setResumable] = useState<RunSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        // Play the frozen published version (the server falls back to the live draft
        // if the course was never published).
        const pub = await getPublished(courseId);
        if (!alive) return;
        setCourse(pub.course);
        setPoints(pub.points);
        // Offer resume only for a PUBLISHED course: an unpublished draft can be edited
        // freely without changing the run key, so a restored run might not match it.
        setResumable(
          pub.course.publishedAt ? readResumable(runKey(courseId, pub.course.publishedAt)) : null
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load course');
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [courseId, initialCourse]);

  const ready = !!course && !!points && !busy;

  const handleStart = async (sim: boolean, resume?: RunSnapshot) => {
    if (!course || !points || busy) return;
    setBusy(true);
    setError(null);
    try {
      const engine = new ExperienceEngine({
        points,
        sim,
        showStartWayfinding: course.showStartWayfinding ?? false,
        zones: course.zones ?? [],
        eyesUp: course.eyesUp ?? false,
        persistKey: runKey(courseId, course.publishedAt),
        resume,
      });
      await engine.start();
      onReady(engine, sim, course);
    } catch {
      setError('Could not start audio on this device');
      setBusy(false);
    }
  };

  const startOver = () => {
    if (course) clearRun(runKey(courseId, course.publishedAt));
    setResumable(null);
  };

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    await playTestTone();
    setTesting(false);
    setTested(true);
  };

  const handleDownload = async () => {
    if (!course || !points || downloading) return;
    setDownloading({ done: 0, total: 0 });
    setError(null);
    try {
      const meta = await downloadPack(courseId, points, course.zones ?? [], setDownloading);
      setPack(meta);
    } catch {
      setError('Could not download this walk for offline use');
    } finally {
      setDownloading(null);
    }
  };

  const handleRemove = async () => {
    await removePack(courseId);
    setPack(null);
  };

  const insecure = !isSecureEnough();
  const canOffline = offlineSupported() && !!points && points.length > 0;
  const estimate = canOffline && !pack ? packEstimate(points!, course?.zones ?? []) : null;
  const pct =
    downloading && downloading.total > 0
      ? Math.round((downloading.done / downloading.total) * 100)
      : 0;

  return (
    <div className="screen screen--gate">
      <button className="link-back" onClick={onBack}>
        &#8592; Courses
      </button>

      <div className="gate-body">
        <h1 className="gate-title">{course?.name ?? 'Loading…'}</h1>
        {course?.description && <p className="gate-desc">{course.description}</p>}

        {points && points.length > 0 && (
          <>
            <StartMap points={points} />
            <p className="gate-hint">Head to the start pin to begin.</p>
          </>
        )}

        {canOffline && (
          <div className="offline">
            {pack ? (
              <div className="offline__row">
                <span className="offline__ok">✓ Available offline</span>
                <button type="button" className="linkish" onClick={() => void handleRemove()}>
                  Remove
                </button>
              </div>
            ) : downloading ? (
              <div className="offline__progress">
                <div className="offline__bar">
                  <div className="offline__fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="offline__pct">Downloading… {pct}%</span>
              </div>
            ) : (
              <button type="button" className="btn-offline" onClick={() => void handleDownload()}>
                ⭳ Download for offline
                {estimate && estimate.tiles > 0 && (
                  <span className="offline__hint"> · map + {estimate.audio} clips</span>
                )}
              </button>
            )}
          </div>
        )}

        {error && <div className="notice notice--error">{error}</div>}
        {insecure && (
          <div className="notice notice--warn">
            Location and compass need HTTPS (or localhost). Audio still works.
          </div>
        )}

        <div className="audio-check">
          <p className="audio-check__title">Check your sound first</p>
          <ul className="audio-check__list">
            <li>🎧 Put on headphones</li>
            <li>🔊 Turn the volume up</li>
            <li>
              Heard nothing?{' '}
              <button type="button" className="linkish" onClick={() => window.location.reload()}>
                Reload the page
              </button>
            </li>
          </ul>
          <button type="button" className="btn-test" disabled={testing} onClick={() => void runTest()}>
            {testing ? 'Playing…' : tested ? 'Play test sound again' : '▶ Play test sound'}
          </button>
          {tested && (
            <p className="audio-check__ok">You should have heard a tone sweep left → right.</p>
          )}
        </div>

        <button
          className="btn-primary"
          disabled={!ready}
          onClick={() => void handleStart(preferSim, resumable ?? undefined)}
        >
          {busy
            ? 'Starting…'
            : resumable
              ? 'Resume walk'
              : preferSim
                ? 'Start simulation'
                : 'Start listening'}
        </button>

        {resumable && !busy && (
          <button type="button" className="linkish" onClick={startOver}>
            Start over from the beginning
          </button>
        )}

        <p className="gate-hint">Put on headphones and face any direction — you are the center.</p>

        <button className="link-sim" disabled={busy} onClick={() => void handleStart(!preferSim)}>
          {preferSim ? 'Use real sensors' : 'Simulate on desktop'}
        </button>
      </div>
    </div>
  );
}
