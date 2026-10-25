/**
 * Package the rendered Kalmar demo walk (audio/out) into a .audioworld bundle for admin import
 * (⚙️ Settings → Import).
 *
 *   node scripts/kalmar-demo/build.mjs <out.audioworld> [cover.webp|.jpg|.png]
 *
 * The optional image becomes the walk's cover on its start page.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, COURSE, LINES, ROUTE, points, zones } from './course.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'audio', 'out');
const [target, cover] = process.argv.slice(2);
if (!target) {
  console.error('usage: node scripts/kalmar-demo/build.mjs <out.audioworld> [cover image]');
  process.exit(1);
}

const durations = JSON.parse(readFileSync(join(OUT, 'durations.json'), 'utf8'));
const dur = (clip) => {
  if (durations[clip] == null) throw new Error(`clip "${clip}" has not been rendered`);
  return durations[clip];
};

const used = new Set();
/** Each clip's name in the sound library, from where it's first used. */
const names = new Map();
const urlOf = (clip, name) => {
  dur(clip); // must exist
  used.add(clip);
  if (name && !names.has(clip)) names.set(clip, name);
  return `/uploads/kalmar-demo-${clip}.mp3`;
};
const isVoice = (clip) => !!(CLIPS[clip].voice || CLIPS[clip].mix?.some((l) => l.voice));

/** The spoken manuscript behind a clip (for the point's knowledge base), or ''. */
function scriptOf(clip) {
  const spec = CLIPS[clip];
  const voices = spec.voice ? [spec.voice] : (spec.mix ?? []).filter((l) => l.voice).map((l) => l.voice);
  return voices.map((v) => LINES[v][1]).join('\n\n');
}

function audioFor(a, title, facts) {
  const script = scriptOf(a.clip);
  return {
    kind: 'upload',
    url: urlOf(a.clip, title),
    title,
    description: [facts, script && `Manus:\n${script}`].filter(Boolean).join('\n\n'),
    ...(a.variants
      ? { variants: a.variants.map((v) => ({ lang: v.lang, kind: 'upload', url: urlOf(v.clip, `${title} (${v.lang})`), title: `${title} (${v.lang})` })) }
      : {}),
  };
}

const now = new Date().toISOString();
const builtPoints = points(dur).map((p) => {
  const { facts, audio, stops, ...rest } = p;
  const point = {
    courseId: '',
    sync: 'individual',
    volume: 1,
    ...rest,
    audio: audioFor(audio, p.name, facts),
    createdAt: now,
    updatedAt: now,
  };
  if (stops) {
    point.stops = stops.map((s) => ({
      index: s.index,
      dwellSec: s.dwellSec,
      audio: { kind: 'upload', url: urlOf(s.clip, `${p.name} — stopp ${s.index + 1}`), title: `${p.name} — stopp ${s.index + 1}` },
      facts: scriptOf(s.clip),
    }));
  }
  return point;
});

const builtZones = zones().map((z, i) => ({
  id: `kalmar-demo-zone-${i + 1}`,
  name: z.name,
  polygon: z.polygon.map(([lat, lng]) => ({ lat, lng })),
  reverb: z.reverb,
  wet: z.wet,
  ...(z.ambience ? { ambienceUrl: urlOf(z.ambience, `${z.name} — bakgrund`), ambienceVolume: z.ambienceVolume } : {}),
}));

const assets = [...used].map((clip) => ({
  url: `/uploads/kalmar-demo-${clip}.mp3`,
  filename: `kalmar-demo-${clip}.mp3`,
  mime: 'audio/mpeg',
  data: readFileSync(join(OUT, `${clip}.mp3`)).toString('base64'),
  description: `${COURSE.name.split(' — ')[0]} · ${names.get(clip) ?? clip}`,
  kind: isVoice(clip) ? 'voice' : 'sfx',
}));

const course = { ...COURSE, zones: builtZones, route: ROUTE };
if (cover) {
  const ext = extname(cover).toLowerCase();
  const mime = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }[ext];
  if (!mime) throw new Error(`unsupported cover type: ${ext}`);
  course.imageUrl = `/uploads/kalmar-demo-cover${ext}`;
  assets.push({ url: course.imageUrl, filename: `kalmar-demo-cover${ext}`, mime, data: readFileSync(cover).toString('base64') });
}

writeFileSync(
  target,
  JSON.stringify({ format: 'audioworld-course', version: 1, exportedAt: now, course, points: builtPoints, assets })
);
console.log(
  `${builtPoints.length} points, ${builtZones.length} zones, ${assets.length} assets` +
    `${cover ? ' (with cover)' : ''} -> ${target} (${(statSync(target).size / 1e6).toFixed(1)} MB)`
);
