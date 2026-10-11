import { useState, type ReactNode } from 'react';
import type { Coordinates } from '@audioworld/shared';

/** Called when a coordinate pair in the text is clicked (show it on the map). */
type OnCoord = ((c: Coordinates) => void) | undefined;

/** "56.67647, 16.37508" — a lat, lng pair written in the text. */
const COORD = /^(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})$/;

/** Inline Markdown: `code`, **bold**, *italic* / _italic_, and clickable coordinates.
 *  Built as React nodes (no HTML). */
function inline(text: string, key: string, onCoord?: OnCoord): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|-?\d{1,2}\.\d{3,},\s*-?\d{1,3}\.\d{3,})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    const coord = COORD.exec(t);
    if (coord) {
      const c = { lat: Number(coord[1]), lng: Number(coord[2]) };
      out.push(
        onCoord && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180 ? (
          <button key={k} type="button" className="md-coord" title="Show on the map" onClick={() => onCoord(c)}>
            📍 {t}
          </button>
        ) : (
          t
        )
      );
    } else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k}>{inline(t.slice(2, -2), k, onCoord)}</strong>);
    else out.push(<em key={k}>{inline(t.slice(1, -1), k, onCoord)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A fenced block — prompts, style descriptions, narration — with a copy button. */
function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <button
        type="button"
        className="md-code__copy"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre>{text}</pre>
    </div>
  );
}

/**
 * The subset of Markdown the assistant writes: paragraphs, headings, lists, quotes and
 * fenced code blocks, plus inline emphasis and code. Rendered as plain React elements, so
 * model output can never inject HTML.
 */
export default function Markdown({ text, onCoord }: { text: string; onCoord?: OnCoord }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${n++}`;
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      i++; // closing fence (or end of a still-streaming block)
      blocks.push(<CodeBlock key={key} text={body.join('\n')} />);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={key} className="md-h">
          {inline(heading[1]!, key, onCoord)}
        </p>
      );
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`, onCoord)}</li>);
      blocks.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), key, onCoord)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^\s*(```|#{1,4}\s|([-*•]|\d+[.)])\s+|>)/.test(lines[i]!)
    ) {
      para.push(lines[i++]!);
    }
    blocks.push(
      <p key={key}>
        {para.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(l, `${key}-${j}`, onCoord)}
          </span>
        ))}
      </p>
    );
  }
  return <div className="md">{blocks}</div>;
}
