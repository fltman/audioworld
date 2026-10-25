import { useEffect, useMemo, useRef, useState } from 'react';
import { DOCS, DOC_GROUPS, searchDocs, searchMarker } from '../docs';
import { helpHref } from '../help';
import DocMarkdown, { docDomId, inline } from './DocMarkdown';

interface Props {
  /** The section to show (the first one when null or unknown). */
  section: string | null;
  /** A heading in it to scroll to. */
  anchor: string | null;
}

/**
 * The admin's help: a table of contents on the left (or, while searching, the matches),
 * the section on the right. Everything is a `#help/…` link, so the back button and
 * shared links work, and the "?" buttons around the admin land on the right heading.
 */
export default function HelpView({ section, anchor }: Props) {
  const [query, setQuery] = useState('');
  const mainRef = useRef<HTMLDivElement | null>(null);
  const index = Math.max(0, DOCS.findIndex((d) => d.id === section));
  const doc = DOCS[index]!;
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];

  const hits = useMemo(() => searchDocs(query), [query]);
  const mark = useMemo(() => searchMarker(query), [query]);
  const searching = query.trim().length >= 2;

  // Land on the heading the link names, or the top of a newly opened section.
  useEffect(() => {
    const el = anchor ? document.getElementById(docDomId(doc.id, anchor)) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else mainRef.current?.scrollTo({ top: 0 });
  }, [doc.id, anchor]);

  return (
    <div className="help">
      <nav className="help__nav" aria-label="Hjälpens innehåll">
        <div className="help__search">
          <input
            className="input"
            type="search"
            placeholder="Sök i hjälpen…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
        </div>

        {searching ? (
          <div className="help__results">
            <p className="help__count">
              {hits.length === 0
                ? 'Inga träffar.'
                : `${hits.length}${hits.length >= 60 ? '+' : ''} träff${hits.length === 1 ? '' : 'ar'}`}
            </p>
            <ul>
              {hits.map((h, i) => (
                <li key={i}>
                  <a
                    className={`help__hit${h.section.id === doc.id && h.anchor === anchor ? ' is-active' : ''}`}
                    href={helpHref(h.anchor ? `${h.section.id}/${h.anchor}` : h.section.id)}
                  >
                    <span className="help__hit-where">
                      {h.section.title}
                      {h.anchor ? ` › ${h.heading}` : ''}
                    </span>
                    <span className="help__hit-snippet">{inline(h.snippet, `hit${i}`, mark)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          DOC_GROUPS.map((g) => (
            <div key={g} className="help__group">
              <div className="help__group-title">{g}</div>
              <ul className="help__toc">
                {DOCS.filter((d) => d.group === g).map((d) => (
                  <li key={d.id}>
                    <a className={d.id === doc.id ? 'is-active' : ''} href={helpHref(d.id)}>
                      {d.title}
                    </a>
                    {d.id === doc.id && d.toc.length > 0 && (
                      <ul className="help__sub">
                        {d.toc.map((t) => (
                          <li key={t.id}>
                            <a className={t.id === anchor ? 'is-active' : ''} href={helpHref(`${d.id}/${t.id}`)}>
                              {t.text}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="help__main" ref={mainRef}>
        <article className="help__article">
          <DocMarkdown section={doc.id} blocks={doc.blocks} mark={searching ? mark : null} />
          <nav className="help__pager" aria-label="Bläddra">
            {prev ? (
              <a href={helpHref(prev.id)} className="help__pager-link">
                <span>← Föregående</span>
                {prev.title}
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a href={helpHref(next.id)} className="help__pager-link help__pager-link--next">
                <span>Nästa →</span>
                {next.title}
              </a>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
