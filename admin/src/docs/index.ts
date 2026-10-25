/**
 * The admin's help: one Markdown file per section (Swedish), in reading order. Each file
 * starts with its `# Title`; `## Subheadings {#anchor}` become the deep links that the "?"
 * buttons in the admin open (`#help/<id>/<anchor>`), so keep those anchors stable.
 */
import { blockText, parseDoc, plainText, type DocBlock } from './parse';
import komIgang from './kom-igang.md?raw';
import film from './film.md?raw';
import demorundan from './demorundan.md?raw';
import koncept from './koncept.md?raw';
import punkttyper from './punkttyper.md?raw';
import oversikt from './oversikt.md?raw';
import kartan from './kartan.md?raw';
import punkter from './punkter.md?raw';
import punktredigeraren from './punktredigeraren.md?raw';
import berattelse from './berattelse.md?raw';
import stopp from './stopp.md?raw';
import flaggor from './flaggor.md?raw';
import zoner from './zoner.md?raw';
import rutt from './rutt.md?raw';
import provlyssna from './provlyssna.md?raw';
import publicera from './publicera.md?raw';
import aiAssistent from './ai-assistent.md?raw';
import upptack from './upptack.md?raw';
import scout from './scout.md?raw';
import statistik from './statistik.md?raw';
import flerval from './flerval.md?raw';
import installningar from './installningar.md?raw';
import ljud from './ljud.md?raw';
import guider from './guider.md?raw';
import anvandare from './anvandare.md?raw';
import tips from './tips.md?raw';
import kortkommandon from './kortkommandon.md?raw';
import faq from './faq.md?raw';
import ordlista from './ordlista.md?raw';

export interface DocSection {
  id: string;
  group: string;
  title: string;
  blocks: DocBlock[];
  /** Its `##` subheadings, for the table of contents. */
  toc: { id: string; text: string }[];
}

const SOURCES: { id: string; group: string; md: string }[] = [
  { id: 'kom-igang', group: 'Börja här', md: komIgang },
  { id: 'film', group: 'Börja här', md: film },
  { id: 'demorundan', group: 'Börja här', md: demorundan },
  { id: 'koncept', group: 'Börja här', md: koncept },
  { id: 'punkttyper', group: 'Börja här', md: punkttyper },
  { id: 'oversikt', group: 'Arbetsytan', md: oversikt },
  { id: 'kartan', group: 'Arbetsytan', md: kartan },
  { id: 'punkter', group: 'Arbetsytan', md: punkter },
  { id: 'punktredigeraren', group: 'Bygga rundan', md: punktredigeraren },
  { id: 'berattelse', group: 'Bygga rundan', md: berattelse },
  { id: 'stopp', group: 'Bygga rundan', md: stopp },
  { id: 'flaggor', group: 'Bygga rundan', md: flaggor },
  { id: 'zoner', group: 'Bygga rundan', md: zoner },
  { id: 'rutt', group: 'Bygga rundan', md: rutt },
  { id: 'provlyssna', group: 'Bygga rundan', md: provlyssna },
  { id: 'publicera', group: 'Bygga rundan', md: publicera },
  { id: 'ai-assistent', group: 'Verktyg', md: aiAssistent },
  { id: 'upptack', group: 'Verktyg', md: upptack },
  { id: 'scout', group: 'Verktyg', md: scout },
  { id: 'statistik', group: 'Verktyg', md: statistik },
  { id: 'flerval', group: 'Verktyg', md: flerval },
  { id: 'installningar', group: 'Verktyg', md: installningar },
  { id: 'ljud', group: 'Flikarna', md: ljud },
  { id: 'guider', group: 'Flikarna', md: guider },
  { id: 'anvandare', group: 'Flikarna', md: anvandare },
  { id: 'tips', group: 'Referens', md: tips },
  { id: 'kortkommandon', group: 'Referens', md: kortkommandon },
  { id: 'faq', group: 'Referens', md: faq },
  { id: 'ordlista', group: 'Referens', md: ordlista },
];

export const DOCS: DocSection[] = SOURCES.map(({ id, group, md }) => {
  const blocks = parseDoc(md);
  const h1 = blocks.find((b) => b.kind === 'heading' && b.level === 1);
  return {
    id,
    group,
    title: h1 && h1.kind === 'heading' ? plainText(h1.text) : id,
    blocks,
    toc: blocks.flatMap((b) => (b.kind === 'heading' && b.level === 2 ? [{ id: b.id, text: plainText(b.text) }] : [])),
  };
});

/** Section groups in reading order. */
export const DOC_GROUPS: string[] = [...new Set(DOCS.map((d) => d.group))];

/** One searchable stretch of a section: its intro, or a `##`/`###` heading and what follows. */
interface Chunk {
  section: DocSection;
  anchor: string | null;
  heading: string;
  text: string;
}

const CHUNKS: Chunk[] = DOCS.flatMap((section) => {
  const chunks: Chunk[] = [];
  let cur: Chunk = { section, anchor: null, heading: section.title, text: '' };
  for (const b of section.blocks) {
    if (b.kind === 'heading' && b.level === 1) continue; // the title is the intro's heading
    if (b.kind === 'heading' && b.level >= 2 && b.level <= 3) {
      if (cur.text.trim()) chunks.push(cur);
      cur = { section, anchor: b.id, heading: plainText(b.text), text: '' };
      continue;
    }
    cur.text += ` ${blockText(b)}`;
  }
  if (cur.text.trim()) chunks.push(cur);
  return chunks;
});

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termsOf = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

/** A regex marking every search term (for <mark>), or null when there's no query. */
export function searchMarker(query: string): RegExp | null {
  const terms = termsOf(query);
  return terms.length ? new RegExp(terms.map(escapeRe).join('|'), 'gi') : null;
}

export interface SearchHit {
  section: DocSection;
  anchor: string | null;
  heading: string;
  snippet: string;
}

/** Stretches of the docs holding every word of the query, with a snippet around the first —
 *  those whose heading names it first, then by how often it comes up. */
export function searchDocs(query: string, limit = 60): SearchHit[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const scored: (SearchHit & { score: number })[] = [];
  for (const c of CHUNKS) {
    const heading = c.heading.toLowerCase();
    const body = c.text.replace(/\s+/g, ' ').trim();
    const low = body.toLowerCase();
    if (!terms.every((t) => heading.includes(t) || low.includes(t))) continue;
    const inHeading = terms.filter((t) => heading.includes(t)).length;
    const count = terms.reduce((n, t) => n + low.split(t).length - 1, 0);
    const at = Math.max(0, low.indexOf(terms[0]!));
    const from = Math.max(0, at - 60);
    const to = Math.min(body.length, at + 120);
    const snippet = `${from > 0 ? '…' : ''}${body.slice(from, to).trim()}${to < body.length ? '…' : ''}`;
    scored.push({ section: c.section, anchor: c.anchor, heading: c.heading, snippet, score: inHeading * 100 + count });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}
