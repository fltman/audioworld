import { useEffect, useRef, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { Radar } from '../components/Radar';
import { MapView } from '../components/MapView';
import { Readout } from '../components/Readout';
import { TopBar, type ExperienceView } from '../components/TopBar';
import { ExperienceEngine, useExperience } from '../services/experience';
import { postAnalytics } from '../api';

interface ExperienceProps {
  engine: ExperienceEngine;
  course: Course;
  onExit: () => void;
}

export function Experience({ engine, course, onExit }: ExperienceProps) {
  const { frameRef, snapshot, muted, toggleMute } = useExperience(engine);
  const [view, setView] = useState<ExperienceView>('radar');
  // Eyes-up hides the visual HUD on a real device; the sim keeps the radar so a
  // desktop author can still see where they are while testing the sonar.
  const eyesUp = (course.eyesUp ?? false) && !engine.isSim();

  // Send the anonymous aggregate report once, on exit or when the page is hidden.
  const sentRef = useRef(false);
  useEffect(() => {
    const flush = () => {
      if (sentRef.current || engine.isSim()) return;
      const report = engine.getAnalytics();
      if (Object.keys(report.cells).length === 0) return;
      sentRef.current = true;
      postAnalytics(course.id, report);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [engine, course.id]);

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

      {eyesUp ? (
        <div className="eyesup">
          <div className="eyesup__ring" />
          <p className="eyesup__title">Eyes up</p>
          <p className="eyesup__sub">
            Pocket the phone and follow the ping toward the next sound — it quickens as
            you close in. A brighter chime means you&rsquo;ve arrived.
          </p>
        </div>
      ) : view === 'radar' ? (
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
