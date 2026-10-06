import { useEffect, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { isValidSlug } from '@audioworld/shared';
import { CoursePicker } from './screens/CoursePicker';
import { StartGate } from './screens/StartGate';
import { Experience } from './screens/Experience';
import { Scout } from './screens/Scout';
import { getCourseBySlug } from './api';
import type { ExperienceEngine } from './services/experience';

type Phase =
  | { name: 'picker'; notice?: string }
  | { name: 'resolving'; slug: string }
  | { name: 'gate'; courseId: string; course: Course | null }
  | { name: 'experience'; engine: ExperienceEngine; course: Course };

const PARAMS = new URLSearchParams(window.location.search);
const PREFER_SIM = PARAMS.get('sim') === '1';

// Course ids are UUIDs; anything else in ?course= is ignored (it flows into API paths
// and storage/cache keys, so it must not be attacker-shaped free text).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A course's short address in the path (`/trettio-spann`), or null. */
function pathSlug(): string | null {
  const m = /^\/([A-Za-z0-9-]+)\/?$/.exec(window.location.pathname);
  const slug = m?.[1]?.toLowerCase();
  return slug && isValidSlug(slug) ? slug : null;
}

function initialPhase(): Phase {
  const courseId = PARAMS.get('course');
  if (courseId && UUID_RE.test(courseId)) return { name: 'gate', courseId, course: null };
  const slug = pathSlug();
  return slug ? { name: 'resolving', slug } : { name: 'picker' };
}

/** Keep the address bar on the open course's short address (so it is the share link), or `/`. */
function showAddress(course: Course | null): void {
  const path = course?.slug ? `/${course.slug}` : '/';
  try {
    window.history.replaceState(null, '', PREFER_SIM ? `${path}?sim=1` : path);
  } catch {
    /* sandboxed — the address just doesn't update */
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  // Field-scouting is a separate authoring flow reached at ?scout — it has its own login.
  const [scouting, setScouting] = useState(() => PARAMS.get('scout') !== null);

  // A short address opens its course straight at the start gate.
  const resolvingSlug = phase.name === 'resolving' ? phase.slug : null;
  useEffect(() => {
    if (!resolvingSlug) return;
    let live = true;
    getCourseBySlug(resolvingSlug)
      .then((course) => live && setPhase({ name: 'gate', courseId: course.id, course }))
      .catch(() => {
        if (!live) return;
        showAddress(null);
        setPhase({ name: 'picker', notice: `There is no walk at /${resolvingSlug} — pick one below.` });
      });
    return () => {
      live = false;
    };
  }, [resolvingSlug]);

  if (scouting) return <Scout onExit={() => setScouting(false)} />;

  switch (phase.name) {
    case 'resolving':
      return (
        <div className="screen screen--picker">
          <div className="notice">Opening the walk…</div>
        </div>
      );

    case 'picker':
      return (
        <CoursePicker
          notice={phase.notice}
          onPick={(course) => {
            showAddress(course);
            setPhase({ name: 'gate', courseId: course.id, course });
          }}
        />
      );

    case 'gate':
      return (
        <StartGate
          courseId={phase.courseId}
          course={phase.course}
          preferSim={PREFER_SIM}
          onReady={(engine, _sim, course) => setPhase({ name: 'experience', engine, course })}
          onBack={() => {
            showAddress(null);
            setPhase({ name: 'picker' });
          }}
        />
      );

    case 'experience':
      return (
        <Experience
          engine={phase.engine}
          course={phase.course}
          onExit={() => {
            phase.engine.dispose();
            setPhase({ name: 'gate', courseId: phase.course.id, course: phase.course });
          }}
        />
      );
  }
}
