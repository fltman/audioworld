import { useState, type ReactNode } from 'react';

interface Props {
  /** Fired only after the user confirms. */
  onConfirm: () => void;
  /** Resting label (e.g. "Delete", "Delete zone"). */
  children: ReactNode;
  /** Classes for the resting/confirm button (defaults to a small danger button). */
  className?: string;
  /** Danger button label once armed. */
  confirmLabel?: string;
  /** Ghost button label once armed. */
  cancelLabel?: string;
  title?: string;
}

/**
 * A destructive button that needs a second, deliberate click. The first click arms it,
 * swapping in an explicit confirm + cancel so a delete can't happen on a single stray click.
 * Matches the inline confirm pattern used elsewhere (PointList, course settings, bulk bar).
 */
export default function ConfirmButton({
  onConfirm,
  children,
  className = 'btn btn-danger small',
  confirmLabel = 'Yes, delete',
  cancelLabel = 'Cancel',
  title,
}: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} title={title} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }

  return (
    <span className="confirm-inline">
      <button
        type="button"
        className={className}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost small" onClick={() => setArmed(false)}>
        {cancelLabel}
      </button>
    </span>
  );
}
