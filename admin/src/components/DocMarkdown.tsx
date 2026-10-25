import type { MouseEvent, ReactNode } from 'react';
import type { DocBlock } from '../docs/parse';
import { helpHref } from '../help';

/** Callout labels, in the docs' language. */
const CALLOUT_LABEL: Record<'tip' | 'note' | 'warning', string> = {
  tip: 'Tips',
  note: 'Bra att veta',
  warning: 'Se upp',
};

/** The DOM id of a heading in a help section (unique across the page). */
export const docDomId = (section: string, anchor?: string): string =>
  anchor ? `help-${section}-${anchor}` : `help-${section}`;

/** An image path in the docs: relative ones live in the admin's public docs/img folder. */
function imageSrc(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src;
  return `${import.meta.env.BASE_URL}docs/${src.replace(/^\.\//, '')}`;
}

/** A video in the docs (the film): `![caption](film/name.mp4)`, with name.jpg as its poster
 *  and name.vtt as its captions beside it. */
const isVideo = (src: string): boolean => /\.(mp4|webm)$/i.test(src);
const sibling = (src: string, ext: string): string => imageSrc(src.replace(/\.\w+$/, ext));

/** "[0:37 Översikt](#t=37)" jumps the film on the same page to that second. */
function seekFilm(e: MouseEvent<HTMLAnchorElement>) {
  // Never follow the link: "#t=…" isn't a help address and would close the help.
  e.preventDefault();
  const t = Number(e.currentTarget.getAttribute('href')?.slice(3));
  const video = e.currentTarget.closest('.help__article')?.querySelector('video');
  if (!video || !Number.isFinite(t)) return;
  video.currentTime = t;
  void video.play().catch(() => {});
  video.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Wrap what the search matched in <mark>. */
function highlight(text: string, re: RegExp | null, key: string): ReactNode[] {
  if (!re) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={`${key}-m${n++}`} className="doc-mark">
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Inline Markdown: `code`, **bold**, *italic*, [links](…), ![images](…) and [[keys]].
 *  Built as React nodes (no HTML). */
export function inline(text: string, key: string, mark: RegExp | null): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...highlight(text.slice(last, m.index), mark, `${key}-t${i}`));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('`')) {
      out.push(<code key={k}>{highlight(t.slice(1, -1), mark, k)}</code>);
    } else if (t.startsWith('[[')) {
      out.push(<kbd key={k}>{t.slice(2, -2)}</kbd>);
    } else if (t.startsWith('![')) {
      const im = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t)!;
      out.push(<img key={k} className="doc-inline-img" src={imageSrc(im[2]!)} alt={im[1]} />);
    } else if (t.startsWith('[')) {
      const ln = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const href = ln[2]!;
      const label = inline(ln[1]!, k, mark);
      // "#help/…" (or a bare "help/…") stays in the admin; anything else opens a new tab.
      out.push(
        href.startsWith('#t=') ? (
          <a key={k} href={href} onClick={seekFilm}>
            {label}
          </a>
        ) : href.startsWith('#') || href.startsWith('help/') ? (
          <a key={k} href={href.startsWith('#') ? href : helpHref(href.slice(5))}>
            {label}
          </a>
        ) : (
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        )
      );
    } else if (t.startsWith('**')) {
      out.push(<strong key={k}>{inline(t.slice(2, -2), k, mark)}</strong>);
    } else {
      out.push(<em key={k}>{inline(t.slice(1, -1), k, mark)}</em>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(...highlight(text.slice(last), mark, `${key}-end`));
  return out;
}

interface Props {
  /** The section these blocks belong to (heading ids and their deep links). */
  section: string;
  blocks: DocBlock[];
  /** What the search matched, highlighted in the text (or null). */
  mark: RegExp | null;
}

/** A help page: parsed doc blocks rendered as plain React elements. */
export default function DocMarkdown({ section, blocks, mark }: Props) {
  return (
    <div className="doc">
      {blocks.map((b, n) => {
        const key = `b${n}`;
        switch (b.kind) {
          case 'heading': {
            const content = inline(b.text, key, mark);
            if (b.level === 1) {
              return (
                <h1 key={key} id={docDomId(section)}>
                  {content}
                </h1>
              );
            }
            const Tag = b.level === 2 ? 'h2' : b.level === 3 ? 'h3' : 'h4';
            return (
              <Tag key={key} id={docDomId(section, b.id)}>
                {content}
                <a className="doc-anchor" href={helpHref(`${section}/${b.id}`)} title="Länk hit" aria-label="Länk hit">
                  #
                </a>
              </Tag>
            );
          }
          case 'para':
            return <p key={key}>{inline(b.text, key, mark)}</p>;
          case 'list': {
            const items = b.items.map((it, j) => (
              <li key={j}>
                {inline(it.text, `${key}-${j}`, mark)}
                {it.children.length > 0 && (
                  <ul>
                    {it.children.map((c, ci) => (
                      <li key={ci}>{inline(c, `${key}-${j}-${ci}`, mark)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ));
            return b.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          case 'table':
            return (
              <div key={key} className="doc-table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j}>{inline(h, `${key}-h${j}`, mark)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci}>{inline(c, `${key}-${ri}-${ci}`, mark)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'callout':
            if (b.tone === 'quote') {
              return (
                <blockquote key={key}>
                  {b.paras.map((p, j) => (
                    <p key={j}>{inline(p, `${key}-${j}`, mark)}</p>
                  ))}
                </blockquote>
              );
            }
            return (
              <aside key={key} className={`doc-callout doc-callout--${b.tone}`}>
                <span className="doc-callout__label">{CALLOUT_LABEL[b.tone]}</span>
                {b.paras.map((p, j) => (
                  <p key={j}>{inline(p, `${key}-${j}`, mark)}</p>
                ))}
              </aside>
            );
          case 'code':
            return (
              <pre key={key} className="doc-code">
                {b.text}
              </pre>
            );
          case 'image':
            return isVideo(b.src) ? (
              <figure key={key} className="doc-figure doc-video">
                <video controls preload="metadata" playsInline poster={sibling(b.src, '.jpg')}>
                  <source src={imageSrc(b.src)} type={b.src.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
                  <track kind="captions" srcLang="sv" label="Svenska" src={sibling(b.src, '.vtt')} default />
                </video>
                {b.alt && <figcaption>{b.alt}</figcaption>}
              </figure>
            ) : (
              <figure key={key} className="doc-figure">
                <img src={imageSrc(b.src)} alt={b.alt} loading="lazy" />
                {b.alt && <figcaption>{b.alt}</figcaption>}
              </figure>
            );
          case 'rule':
            return <hr key={key} />;
        }
      })}
    </div>
  );
}
