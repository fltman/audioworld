/**
 * Build a .audioworld course bundle from the "Vålnaderna på Kvarnholmen" ghosts in the
 * kalmar-kvarnholmen-web project: model coords (three.js x/z) -> WGS84, each ghost's mp3
 * inlined, and its manuscript (vault/Spokhistorier.md) as the point's knowledge base.
 * Import the result in the admin (⚙️ Settings → Import).
 *
 *   node scripts/build-kalmar-ghosts.mjs <kalmar-kvarnholmen-web dir> <out.audioworld>
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [webArg, OUT] = process.argv.slice(2);
if (!webArg || !OUT) {
  console.error('usage: node scripts/build-kalmar-ghosts.mjs <kalmar-kvarnholmen-web dir> <out.audioworld>');
  process.exit(1);
}
const WEB = resolve(webArg);

// Model frame (kalmar-kvarnholmen/source/site.json): origin + 28.2° rotation, metres.
// Blender local: x = e·cosR + n·sinR, y = −e·sinR + n·cosR; three.js: x = bx, z = −by.
const LAT0 = 56.66412, LON0 = 16.3656, R = (28.2 * Math.PI) / 180;
const M_PER_DEG = 111320;
function toLatLng(x, z) {
  const bx = x, by = -z;
  const e = bx * Math.cos(R) - by * Math.sin(R);
  const n = bx * Math.sin(R) + by * Math.cos(R);
  return {
    lat: +(LAT0 + n / M_PER_DEG).toFixed(7),
    lng: +(LON0 + e / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180))).toFixed(7),
  };
}

// Ghost positions from src/ghosts.js.
const src = readFileSync(join(WEB, 'src/ghosts.js'), 'utf8');
const ghosts = [...src.matchAll(/\{ id: '([a-z_]+)', x: (-?[\d.]+), z: (-?[\d.]+)/g)].map((m) => ({
  id: m[1], x: Number(m[2]), z: Number(m[3]),
}));

// Manuscript sections from vault/Spokhistorier.md, numbered 1..27.
const md = readFileSync(join(WEB, 'vault/Spokhistorier.md'), 'utf8');
const sections = new Map();
for (const part of md.split(/^## /m).slice(1)) {
  const [head, ...rest] = part.split('\n');
  const m = /^(\d+)\.\s+(.+)$/.exec(head.trim());
  if (!m) continue;
  sections.set(Number(m[1]), { heading: m[2].trim(), body: rest.join('\n').trim() });
}

// Section number -> ghost id (from the headings).
const SECTION_OF = {
  haijock: 1, radhusratten: 2, klockaren: 3, pestankan: 4, gamla_staden: 5, vaktsoldaten: 6,
  tvatterskan: 7, stadsvakten: 8, smeden: 9, kallarmastaren: 10, vitafrun: 11, parkvakten: 12,
  farjevantaren: 13, rangeraren: 14, malaren: 15, burmaseglaren: 16, badvakten: 17, wollberg: 18,
  ombudet: 19, nodhjalparen: 20, vedvakten: 21, tygmastarens_anka: 22, rackaren: 23,
  vekesnoddaren: 24, riddaren: 25, lektorn: 26, konstapeln: 27,
};

// A ghost speaks within this radius. The closest pair (Pestänkan – Stadsvakten) stands
// ~28 m apart, so anything above ~14 m makes neighbouring stories overlap.
const RADIUS = 13;

if (ghosts.length !== 27) throw new Error(`expected 27 ghosts, parsed ${ghosts.length}`);
const now = new Date().toISOString();
const points = [];
const assets = [];
for (const g of ghosts) {
  const sec = sections.get(SECTION_OF[g.id]);
  if (!sec) throw new Error(`no manuscript section for ${g.id}`);
  const file = join(WEB, 'public/audio/ghosts', `${g.id}.mp3`);
  if (!existsSync(file)) throw new Error(`missing audio for ${g.id}`);
  const name = sec.heading.split(' — ')[0].trim();
  const url = `/uploads/valnad-${g.id}.mp3`;
  assets.push({
    url,
    filename: `valnad-${g.id}.mp3`,
    mime: 'audio/mpeg',
    data: readFileSync(file).toString('base64'),
  });
  points.push({
    id: g.id,
    courseId: '',
    name,
    type: 'static',
    center: toLatLng(g.x, g.z),
    radius: RADIUS,
    audio: { kind: 'upload', url, title: sec.heading, description: sec.body },
    playback: { loop: false, stopAfter: true, reload: false },
    volume: 1,
    sync: 'individual',
    createdAt: now,
    updatedAt: now,
  });
  console.log(
    `${g.id.padEnd(18)} ${points.at(-1).center.lat.toFixed(5)}, ${points.at(-1).center.lng.toFixed(5)}  ` +
      `${(statSync(file).size / 1e6).toFixed(1)} MB  ${name}`
  );
}

const bundle = {
  format: 'audioworld-course',
  version: 1,
  exportedAt: now,
  course: {
    name: 'Vålnaderna på Kvarnholmen',
    description:
      'Tjugosju vålnader på Kvarnholmen i Kalmar berättar var sin spökhistoria om platsen de står på. ' +
      'Gå nära så vaknar de.',
    showStartWayfinding: false,
    eyesUp: false,
    zones: [],
  },
  points,
  assets,
};
writeFileSync(OUT, JSON.stringify(bundle));
console.log(`\n${points.length} points, ${assets.length} clips -> ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
