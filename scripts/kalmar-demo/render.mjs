/**
 * Render every clip of the Kalmar demo walk into audio/out/*.mp3 (+ durations.json).
 *
 *  1. Voices: ElevenLabs text-to-speech (model eleven_v4), one request per line.
 *  2. Sound effects: ElevenLabs sound generation.
 *  3. Clips: single sources are loudness-normalised; mixes are layered with ffmpeg first.
 *
 *   ELEVENLABS_API_KEY=... node scripts/kalmar-demo/render.mjs
 *
 * Sources are cached by content in audio/src: a changed line or prompt is regenerated, unchanged
 * ones are reused, so re-runs only pay for what changed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, LINES, SFX, TTS_MODEL, VOICES } from './course.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'audio', 'src');
const OUT = join(HERE, 'audio', 'out');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Target loudness (LUFS) per kind of clip.
const LUFS = { voice: -16, sfx: -18, bed: -22 };

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const duration = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

/** POST to ElevenLabs and return the audio bytes, retrying briefly on rate limits. */
async function eleven(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1${path}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

/** Render one source once; `key` is what it's made from, so a change re-renders it. */
async function cached(file, key, make) {
  const meta = `${file}.json`;
  if (existsSync(file) && existsSync(meta) && readFileSync(meta, 'utf8') === key) return file;
  writeFileSync(file, await make());
  writeFileSync(meta, key);
  return file;
}

function renderVoice(name) {
  const [role, text] = LINES[name];
  const voiceId = VOICES[role];
  const file = join(SRC, `voice_${name}.mp3`);
  return cached(file, JSON.stringify({ voiceId, text, model: TTS_MODEL }), () => {
    console.log(`voice  ${name} (${role}, ${text.length} chars)`);
    return eleven(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { text, model_id: TTS_MODEL });
  });
}

function renderSfx(name) {
  const [text, seconds, loop] = SFX[name];
  const file = join(SRC, `sfx_${name}.mp3`);
  return cached(file, JSON.stringify({ text, seconds, loop }), async () => {
    console.log(`sfx    ${name} (${seconds}s${loop ? ', loop' : ''})`);
    const body = { text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) };
    try {
      return await eleven('/sound-generation', body);
    } catch (e) {
      if (!loop) throw e;
      // Older sound models don't take `loop`; fall back to a plain clip.
      console.log(`       loop rejected (${e.message.slice(0, 60)}), retrying without it`);
      delete body.loop;
      return eleven('/sound-generation', body);
    }
  });
}

const sourceFile = (layer) => (layer.voice ? join(SRC, `voice_${layer.voice}.mp3`) : join(SRC, `sfx_${layer.sfx}.mp3`));

/** Loudness-normalise one file into the output clip. */
function normalise(input, out, lufs) {
  run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11`, '-ar', '44100', '-b:a', '128k', out]);
}

/** Layer a mix: each layer at its start time (seconds), at its gain, then normalise. */
function renderMix(spec, out, lufs) {
  let end = 0;
  for (const l of spec.mix) end = Math.max(end, (l.at ?? 0) + duration(sourceFile(l)));
  const total = end + (spec.tail ?? 1);
  const args = ['-y', '-v', 'error'];
  const chains = [];
  spec.mix.forEach((l, i) => {
    args.push('-i', sourceFile(l));
    const delay = Math.round((l.at ?? 0) * 1000);
    chains.push(`[${i}:a]aresample=44100,volume=${l.db ?? 0}dB,adelay=${delay}|${delay}[l${i}]`);
  });
  const inputs = spec.mix.map((_, i) => `[l${i}]`).join('');
  const filter = `${chains.join(';')};${inputs}amix=inputs=${spec.mix.length}:duration=longest:normalize=0,atrim=0:${total.toFixed(2)},loudnorm=I=${lufs}:TP=-1.5:LRA=11[out]`;
  run('ffmpeg', [...args, '-filter_complex', filter, '-map', '[out]', '-ar', '44100', '-b:a', '128k', out]);
}

// 1–2. Sources (sequentially: ElevenLabs limits concurrent requests).
for (const name of Object.keys(LINES)) await renderVoice(name);
for (const name of Object.keys(SFX)) await renderSfx(name);

// 3. Clips.
const durations = {};
for (const [name, spec] of Object.entries(CLIPS)) {
  const out = join(OUT, `${name}.mp3`);
  const kind = spec.lufs ?? (spec.bed ? 'bed' : spec.voice || spec.mix?.some((l) => l.voice) ? 'voice' : 'sfx');
  if (spec.mix) renderMix(spec, out, LUFS[kind]);
  else normalise(sourceFile(spec), out, LUFS[kind]);
  durations[name] = +duration(out).toFixed(2);
  console.log(`clip   ${name.padEnd(18)} ${durations[name].toFixed(1).padStart(5)} s  (${kind})`);
}
writeFileSync(join(OUT, 'durations.json'), JSON.stringify(durations, null, 1));
console.log(`\n${Object.keys(durations).length} clips -> ${OUT}`);
