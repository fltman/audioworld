import { useState } from 'react';
import type { Course } from '@audioworld/shared';
import { CoursePicker } from './screens/CoursePicker';
import { StartGate } from './screens/StartGate';
import { Experience } from './screens/Experience';
import type { ExperienceEngine } from './services/experience';

type Phase =
  | { name: 'picker' }
  | { name: 'gate'; courseId: string; course: Course | null }
  | { name: 'experience'; engine: ExperienceEngine; course: Course };

const PARAMS = new URLSearchParams(window.location.search);
const PREFER_SIM = PARAMS.get('sim') === '1';

function initialPhase(): Phase {
  const courseId = PARAMS.get('course');
  return courseId ? { name: 'gate', courseId, course: null } : { name: 'picker' };
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);

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
