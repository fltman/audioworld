import { useState } from 'react';
import type { Course } from '@audioworld/shared';
import { Radar } from '../components/Radar';
import { MapView } from '../components/MapView';
import { Readout } from '../components/Readout';
import { TopBar, type ExperienceView } from '../components/TopBar';
import { ExperienceEngine, useExperience } from '../services/experience';

interface ExperienceProps {
  engine: ExperienceEngine;
  course: Course;
  onExit: () => void;
}

export function Experience({ engine, course, onExit }: ExperienceProps) {
  const { frameRef, snapshot, muted, toggleMute } = useExperience(engine);
  const [view, setView] = useState<ExperienceView>('radar');

  return (
    <div className="screen screen--experience">
      <TopBar
        courseName={course.name}
        audibleCount={snapshot.audibleCount}
        muted={muted}
        view={view}
        onSetView={setView}
        onToggleMute={toggleMute}
        onExit={onExit}
      />

      {view === 'radar' ? (
        <div className="radar-stage">
          <Radar engine={engine} frameRef={frameRef} />
        </div>
      ) : (
        <MapView engine={engine} frameRef={frameRef} />
      )}

      {engine.isSim() && <SimControls engine={engine} heading={snapshot.headingDeg ?? 0} />}

      <Readout snap={snapshot} />
    </div>
  );
}

interface SimControlsProps {
  engine: ExperienceEngine;
  heading: number;
}

function SimControls({ engine, heading }: SimControlsProps) {
  return (
    <div className="sim-controls">
      <div className="sim-controls__hint">WASD / arrows move · Q/E turn</div>
      <label className="sim-controls__dial">
        <span>{Math.round(heading)}°</span>
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(heading)}
          onChange={(e) => engine.setHeadingSim(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
