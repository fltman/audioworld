export type ExperienceView = 'radar' | 'map';

interface TopBarProps {
  courseName: string;
  audibleCount: number;
  muted: boolean;
  view: ExperienceView;
  onSetView: (v: ExperienceView) => void;
  onToggleMute: () => void;
  onExit: () => void;
}

export function TopBar({
  courseName,
  audibleCount,
  muted,
  view,
  onSetView,
  onToggleMute,
  onExit,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onExit} aria-label="Back to courses">
        &#8592;
      </button>
      <div className="topbar__title">
        <span className="topbar__course">{courseName}</span>
        <span className="topbar__count" data-active={audibleCount > 0}>
          {audibleCount} audible
        </span>
      </div>
      <div className="topbar__right">
        <div className="segmented" role="tablist" aria-label="View">
          <button
            className={view === 'radar' ? 'is-on' : ''}
            onClick={() => onSetView('radar')}
            role="tab"
            aria-selected={view === 'radar'}
          >
            Radar
          </button>
          <button
            className={view === 'map' ? 'is-on' : ''}
            onClick={() => onSetView('map')}
            role="tab"
            aria-selected={view === 'map'}
          >
            Map
          </button>
        </div>
        <button
          className={`icon-btn${muted ? ' icon-btn--on' : ''}`}
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '\u{1F507}' : '\u{1F50A}'}
        </button>
      </div>
    </header>
  );
}
