import { useCallback, useEffect, useState } from 'react';
import type { AudioPoint, Coordinates, Course } from '@audioworld/shared';
import { anchorOf, pathLength } from '@audioworld/shared';
import { absoluteAudioUrl, getPublished } from '../api';
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
  const [loadFailed, setLoadFailed] = useState(false);

  // Load the frozen published version (server falls back to the live draft if never
  // published). Retryable so a flaky-connection failure isn't a dead end.
  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const pub = await getPublished(courseId);
      setCourse(pub.course);
      setPoints(pub.points);
      // Offer resume only for a PUBLISHED course: an unpublished draft can be edited
      // freely without changing the run key, so a restored run might not match it.
      setResumable(
        pub.course.publishedAt ? readResumable(runKey(courseId, pub.course.publishedAt)) : null
      );
    } catch {
      setLoadFailed(true);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = !!course && !!points && !busy;

  const handleStart = async (sim: boolean, resume?: RunSnapshot) => {
    if (!course || !points || busy) return;
    setBusy(true);
    setError(null);
    try {
      const engine = new ExperienceEngine({
        points,
        sim,
        simStart: course.route?.[0],
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
  const stats = points ? walkStats(points, course?.route) : null;
  const start = course?.route?.[0] ?? (points?.[0] ? anchorOf(points[0]) : null);
  const cover = course?.imageUrl ? absoluteAudioUrl(course.imageUrl) : null;

  return (
    <div className="screen screen--gate">
      <header className={`gate-hero${cover ? ' gate-hero--image' : ''}`}>
        {cover && <img className="gate-hero__img" src={cover} alt="" />}
        <div className="gate-hero__inner">
          <button className="gate-back" onClick={onBack}>
            &#8592; All walks
          </button>
          <div className="gate-hero__text">
            <p className="gate-kicker">🎧 Sound walk</p>
            <h1 className="gate-title">
              {course?.name ?? (loadFailed ? 'Couldn’t load this walk' : 'Loading…')}
            </h1>
            {stats && (
              <ul className="gate-facts">
                {stats.meters >= 50 && <li>{distanceLabel(stats.meters)}</li>}
                {stats.meters >= 50 && <li>about {durationLabel(stats.meters)}</li>}
                <li>
                  {stats.sounds} sound{stats.sounds === 1 ? '' : 's'}
                </li>
              </ul>
            )}
          </div>
        </div>
      </header>

      <main className="gate-main">
        {!course && loadFailed && (
          <div className="gate-card">
            <p className="gate-text">Check your connection and try again.</p>
            <button type="button" className="btn-test" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {course?.description && <Description text={course.description} />}
        {course && (
          <p className="gate-explainer">
            Put on headphones and walk. The sounds sit in the real world around you — turn your
            head and they stay where they are.
          </p>
        )}

        {points && points.length > 0 && start && (
          <section className="gate-card">
            <h2 className="gate-card__title">Where it starts</h2>
            <StartMap points={points} route={course?.route} />
            <div className="gate-card__row">
              <span className="gate-text">Head to the start pin to begin.</span>
              <a className="gate-link" href={directionsUrl(start)} target="_blank" rel="noopener noreferrer">
                Directions ↗
              </a>
            </div>
          </section>
        )}

        {course && (
          <section className="gate-card">
            <h2 className="gate-card__title">Before you go</h2>
            <ul className="gate-checklist">
              <li>🎧 Headphones on — the sound is 3D</li>
              <li>🔊 Volume up</li>
              {!preferSim && <li>📍 Allow location and compass when asked — that’s how the sound knows where you are</li>}
            </ul>
            <div className="gate-card__actions">
              <button type="button" className="btn-test" disabled={testing} onClick={() => void runTest()}>
                {testing ? 'Playing…' : tested ? '▶ Play again' : '▶ Test sound'}
              </button>
              {canOffline &&
                (pack ? (
                  <span className="offline__row">
                    <span className="offline__ok">✓ Available offline</span>
                    <button type="button" className="linkish" onClick={() => void handleRemove()}>
                      Remove
                    </button>
                  </span>
                ) : downloading ? (
                  <span className="offline__progress">
                    <span className="offline__bar">
                      <span className="offline__fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="offline__pct">Downloading… {pct}%</span>
                  </span>
                ) : (
                  <button type="button" className="btn-offline" onClick={() => void handleDownload()}>
                    ↓ Save for offline
                    {estimate && estimate.tiles > 0 && (
                      <span className="offline__hint"> · map + {estimate.audio} clips</span>
                    )}
                  </button>
                ))}
            </div>
            {tested && (
              <p className="gate-text gate-text--ok">
                You should have heard a tone sweep from left to right. Heard nothing?{' '}
                <button type="button" className="linkish" onClick={() => window.location.reload()}>
                  Reload the page
                </button>
              </p>
            )}
          </section>
        )}

        {error && <div className="notice notice--error">{error}</div>}
        {insecure && (
          <div className="notice notice--warn">
            Location and compass need HTTPS (or localhost). Audio still works.
          </div>
        )}
      </main>

      {course && (
        <footer className="gate-cta">
          <div className="gate-cta__inner">
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
            <div className="gate-cta__links">
              {resumable && !busy && (
                <button type="button" className="linkish" onClick={startOver}>
                  Start over
                </button>
              )}
              <button className="link-sim" disabled={busy} onClick={() => void handleStart(!preferSim)}>
                {preferSim ? 'Use real sensors' : 'Try it on this screen'}
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

/** Long descriptions start folded to a few lines, with a toggle. */
function Description({ text }: { text: string }) {
  const long = text.length > 280;
  const [open, setOpen] = useState(false);
  return (
    <div className="gate-desc-wrap">
      <p className={`gate-desc${long && !open ? ' gate-desc--folded' : ''}`}>{text}</p>
      {long && (
        <button type="button" className="gate-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** An easy walking pace including stops to listen (m/s). */
const WALK_MPS = 1.2;

/** How far the walk goes — along the planned route, else from point to point in order. */
function walkStats(points: AudioPoint[], route: Coordinates[] | undefined): { meters: number; sounds: number } {
  const meters =
    route && route.length >= 2 ? pathLength(route) : pathLength(points.map((p) => anchorOf(p)));
  return { meters, sounds: points.length };
}

function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function durationLabel(m: number): string {
  const min = Math.max(5, Math.round(m / WALK_MPS / 60 / 5) * 5);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Walking directions to the start in the phone's own maps app. */
function directionsUrl(c: Coordinates): string {
  const at = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${at}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
}
