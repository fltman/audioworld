import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Optional leading glyph. */
  icon?: string;
  /** Whether the section starts expanded. */
  defaultOpen?: boolean;
  /** Optional right-aligned adornment in the header (e.g. a count badge). */
  badge?: ReactNode;
  children: ReactNode;
}

/**
 * A collapsible titled section for the admin sidebar. Groups occasional controls
 * (settings, tools) behind a click so the primary authoring flow stays uncluttered.
 */
export default function Section({ title, icon, defaultOpen = false, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section section--collapsible">
      <button
        type="button"
        className="section-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`section-chevron${open ? ' is-open' : ''}`} aria-hidden>
          ▸
        </span>
        <span className="section-head__title">
          {icon ? `${icon} ` : ''}
          {title}
        </span>
        {badge != null && <span className="section-head__badge">{badge}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
