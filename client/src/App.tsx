import { useState } from 'react';
import type { Course } from '@audioworld/shared';
import { CoursePicker } from './screens/CoursePicker';
import { StartGate } from './screens/StartGate';
import { Experience } from './screens/Experience';
import { Scout } from './screens/Scout';
import type { ExperienceEngine } from './services/experience';

type Phase =
  | { name: 'picker' }
  | { name: 'gate'; courseId: string; course: Course | null }
  | { name: 'experience'; engine: ExperienceEngine; course: Course };

const PARAMS = new URLSearchParams(window.location.search);
const PREFER_SIM = PARAMS.get('sim') === '1';

// Course ids are UUIDs; anything else in ?course= is ignored (it flows into API paths
// and storage/cache keys, so it must not be attacker-shaped free text).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initialPhase(): Phase {
  const courseId = PARAMS.get('course');
  return courseId && UUID_RE.test(courseId)
    ? { name: 'gate', courseId, course: null }
    : { name: 'picker' };
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  // Field-scouting is a separate authoring flow reached at ?scout — it has its own login.
  const [scouting, setScouting] = useState(() => PARAMS.get('scout') !== null);

  if (scouting) return <Scout onExit={() => setScouting(false)} />;

  switch (phase.name) {
    case 'picker':
      return (
        <CoursePicker
          onPick={(course) => setPhase({ name: 'gate', courseId: course.id, course })}
        />
      );

    case 'gate':
      return (
        <StartGate
          courseId={phase.courseId}
          course={phase.course}
          preferSim={PREFER_SIM}
          onReady={(engine, _sim, course) => setPhase({ name: 'experience', engine, course })}
          onBack={() => setPhase({ name: 'picker' })}
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
