interface TopBarProps {
  courseName: string;
  audibleCount: number;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
}

export function TopBar({ courseName, audibleCount, muted, onToggleMute, onExit }: TopBarProps) {
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
      <button
        className={`icon-btn${muted ? ' icon-btn--on' : ''}`}
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '\u{1F507}' : '\u{1F50A}'}
      </button>
    </header>
  );
}
