import { useEffect, useState } from 'react';
import type { AudioPoint, Course } from '@audioworld/shared';
import { getCourse, getPoints } from '../api';
import { ExperienceEngine } from '../services/experience';
import { isSecureEnough } from '../services/geolocation';
import { StartMap } from '../components/StartMap';

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

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [c, p] = await Promise.all([
          initialCourse ? Promise.resolve(initialCourse) : getCourse(courseId),
          getPoints(courseId),
        ]);
        if (!alive) return;
        setCourse(c);
        setPoints(p);
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

  const handleStart = async (sim: boolean) => {
    if (!course || !points || busy) return;
    setBusy(true);
    setError(null);
    try {
      const engine = new ExperienceEngine({ points, sim });
      await engine.start();
      onReady(engine, sim, course);
    } catch {
      setError('Could not start audio on this device');
      setBusy(false);
    }
  };

  const insecure = !isSecureEnough();

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

        {error && <div className="notice notice--error">{error}</div>}
        {insecure && (
          <div className="notice notice--warn">
            Location and compass need HTTPS (or localhost). Audio still works.
          </div>
        )}

        <button
          className="btn-primary"
          disabled={!ready}
          onClick={() => void handleStart(preferSim)}
        >
          {busy ? 'Starting…' : preferSim ? 'Start simulation' : 'Start listening'}
        </button>

        <p className="gate-hint">Put on headphones and face any direction — you are the center.</p>

        <button className="link-sim" disabled={busy} onClick={() => void handleStart(!preferSim)}>
          {preferSim ? 'Use real sensors' : 'Simulate on desktop'}
        </button>
      </div>
    </div>
  );
}
