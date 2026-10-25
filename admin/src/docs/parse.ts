/**
 * The Markdown the help pages are written in, parsed into blocks: headings (with anchor
 * ids — `## Rita en zon {#rita}` pins one, otherwise it's made from the text), paragraphs,
 * lists (one level of nesting), pipe tables, callouts (`> [!TIP]`, `> [!NOTE]`,
 * `> [!WARNING]`), quotes, fenced code, images on a line of their own and rules.
 * Inline syntax (`code`, **bold**, *italic*, [links](…), ![images](…), [[keys]]) is left
 * in the text for the renderer.
 */

export type CalloutTone = 'tip' | 'note' | 'warning' | 'quote';

export interface DocListItem {
  text: string;
  children: string[];
}

export type DocBlock =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: DocListItem[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'callout'; tone: CalloutTone; paras: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'image'; alt: string; src: string }
  | { kind: 'rule' };

/** A heading's anchor from its text: lowercase, å/ä → a, ö → o, anything else → "-". */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'avsnitt'
  );
}

const LIST_ITEM = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*?)(?:\s+\{#([a-z0-9-]+)\})?\s*$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const CALLOUT = /^\[!(TIP|NOTE|WARNING)\]\s*$/i;

/** Where a block of some other kind starts — it ends a paragraph. */
const startsBlock = (line: string): boolean =>
  /^\s*```/.test(line) ||
  HEADING.test(line) ||
  LIST_ITEM.test(line) ||
  /^\s*>/.test(line) ||
  /^\s*\|/.test(line) ||
  IMAGE_LINE.test(line.trim()) ||
  /^\s*-{3,}\s*$/.test(line);

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseDoc(source: string): DocBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  const used = new Map<string, number>();
  const uniqueId = (id: string): string => {
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    return n ? `${id}-${n + 1}` : id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const text = heading[2]!.trim();
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        text,
        id: uniqueId(heading[3] ?? slugify(text)),
      });
      i++;
      continue;
    }

    const image = IMAGE_LINE.exec(line.trim());
    if (image) {
      blocks.push({ kind: 'image', alt: image[1]!, src: image[2]! });
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quoted.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      let tone: CalloutTone = 'quote';
      const marker = CALLOUT.exec(quoted[0] ?? '');
      if (marker) {
        tone = marker[1]!.toLowerCase() as CalloutTone;
        quoted.shift();
      }
      // Blank quoted lines split it into paragraphs.
      const paras = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
      blocks.push({ kind: 'callout', tone, paras });
      continue;
    }

    const first = LIST_ITEM.exec(line);
    if (first) {
      const base = first[1]!.length;
      const ordered = /\d/.test(first[2]!);
      const items: DocListItem[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        if (!l.trim()) {
          // A blank line ends the list unless an item of it follows.
          const next = lines[i + 1];
          const m = next != null ? LIST_ITEM.exec(next) : null;
          if (m && m[1]!.length >= base) {
            i++;
            continue;
          }
          break;
        }
        const m = LIST_ITEM.exec(l);
        if (m && m[1]!.length <= base + 1) {
          items.push({ text: m[3]!.trim(), children: [] });
        } else if (m && items.length) {
          items[items.length - 1]!.children.push(m[3]!.trim());
        } else if (/^\s+\S/.test(l) && items.length) {
          // An indented continuation line belongs to the item (or sub-item) above.
          const item = items[items.length - 1]!;
          if (item.children.length) item.children[item.children.length - 1] += ` ${l.trim()}`;
          else item.text += ` ${l.trim()}`;
        } else break;
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !startsBlock(lines[i]!))) {
      para.push(lines[i++]!.trim());
    }
    blocks.push({ kind: 'para', text: para.join(' ') });
  }
  return blocks;
}

/** Text without inline markup — for search and snippets. */
export function plainText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** A block's searchable text. */
export function blockText(b: DocBlock): string {
  switch (b.kind) {
    case 'heading':
    case 'para':
    case 'code':
      return plainText(b.text);
    case 'list':
      return b.items.map((it) => [it.text, ...it.children].map(plainText).join(' ')).join(' ');
    case 'table':
      return [b.head, ...b.rows].map((r) => r.map(plainText).join(' ')).join(' ');
    case 'callout':
      return b.paras.map(plainText).join(' ');
    case 'image':
      return b.alt;
    case 'rule':
      return '';
  }
}
