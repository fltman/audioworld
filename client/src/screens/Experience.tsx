import { useEffect, useState } from 'react';
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
  const { frameRef, snapshot, muted, toggleMute, powerMode } = useExperience(engine);
  const [view, setView] = useState<ExperienceView>('radar');
  // Eyes-up hides the visual HUD on a real device; the sim keeps the radar so a
  // desktop author can still see where they are while testing the sonar.
  const eyesUp = (course.eyesUp ?? false) && !engine.isSim();

  // Send the anonymous aggregate report whenever the page is hidden (the reliable
  // moment on mobile) and on unmount. Draining sends only the delta since the last
  // flush, so multiple screen-offs during a long walk are all captured without
  // double-counting — the previous once-only latch discarded everything after the
  // first screen-off.
  useEffect(() => {
    const flush = () => {
      if (engine.isSim()) return;
      const report = engine.drainAnalytics();
      if (report) postAnalytics(course.id, report);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        // Drain analytics FIRST (marks reached as sent, clears dwell), THEN persist, so
        // the resume snapshot reflects the post-drain state and can't re-send it.
        flush();
        engine.persist();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
      engine.persist(); // capture final progress on a clean exit
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

      {muted && (
        <button type="button" className="mute-banner" onClick={toggleMute}>
          🔇 Sound is muted — tap to unmute
        </button>
      )}

      {powerMode === 'saver' && (
        <div className="power-chip" role="status">
          🔋 Power saver — the map updates less often to save battery. The sound is
          unaffected.
        </div>
      )}

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
