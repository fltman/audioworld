/**
 * Package the rendered Svinö course (audio/out) into a .audioworld bundle for admin import.
 *
 *   node scripts/svino-halloween/build.mjs <out.audioworld>
 *
 * Uses audio/out/music.mp3 as the island's ambient bed when present (the Suno track),
 * otherwise the forest ambience.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, COURSE, LINES, points, zones } from './course.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'audio', 'out');
const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/svino-halloween/build.mjs <out.audioworld>');
  process.exit(1);
}

const durations = JSON.parse(readFileSync(join(OUT, 'durations.json'), 'utf8'));
const dur = (clip) => {
  if (durations[clip] == null) throw new Error(`clip "${clip}" has not been rendered`);
  return durations[clip];
};
const hasMusic = durations.music != null && existsSync(join(OUT, 'music.mp3'));

const used = new Set();
const urlOf = (clip) => {
  dur(clip); // must exist
  used.add(clip);
  return `/uploads/svino-${clip}.mp3`;
};

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
    url: urlOf(a.clip),
    title,
    description: [facts, script && `Manus:\n${script}`].filter(Boolean).join('\n\n'),
    ...(a.variants
      ? { variants: a.variants.map((v) => ({ lang: v.lang, kind: 'upload', url: urlOf(v.clip), title: `${title} (${v.lang})` })) }
      : {}),
  };
}

const now = new Date().toISOString();
const builtPoints = points(dur).map((p, i) => {
  const { facts, audio, stops, ...rest } = p;
  const point = {
    id: `svino-${i + 1}`,
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
      audio: { kind: 'upload', url: urlOf(s.clip), title: s.clip },
      facts: scriptOf(s.clip),
    }));
  }
  return point;
});

const builtZones = zones(hasMusic).map((z, i) => ({
  id: `svino-zone-${i + 1}`,
  name: z.name,
  polygon: z.polygon.map(([lat, lng]) => ({ lat, lng })),
  reverb: z.reverb,
  wet: z.wet,
  ambienceUrl: urlOf(z.ambience),
  ambienceVolume: z.ambienceVolume,
}));

const assets = [...used].map((clip) => ({
  url: `/uploads/svino-${clip}.mp3`,
  filename: `svino-${clip}.mp3`,
  mime: 'audio/mpeg',
  data: readFileSync(join(OUT, `${clip}.mp3`)).toString('base64'),
}));

writeFileSync(
  target,
  JSON.stringify({
    format: 'audioworld-course',
    version: 1,
    exportedAt: now,
    course: { ...COURSE, zones: builtZones },
    points: builtPoints,
    assets,
  })
);
console.log(
  `${builtPoints.length} points, ${builtZones.length} zones, ${assets.length} clips` +
    `${hasMusic ? ' (with Suno music)' : ' (forest bed, no music yet)'} -> ${target} ` +
    `(${(statSync(target).size / 1e6).toFixed(1)} MB)`
);
