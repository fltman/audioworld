/**
 * Render every clip of the Svinö course into audio/out/*.mp3.
 *
 *  1. Voices: one dialogue JSON per line → the elevenlabs-skill's generate_dialogue.py
 *     (text-to-dialogue API, model eleven_v4). Its per-chunk cache makes re-runs free.
 *  2. Sound effects: ElevenLabs sound generation, cached as audio/src/sfx_<name>.mp3.
 *  3. Clips: single sources are loudness-normalised; mixes are layered with ffmpeg first.
 *
 *   ELEVENLABS_API_KEY=... node scripts/svino-halloween/render.mjs
 *
 * Sources are cached by content: a changed line or prompt is regenerated, unchanged ones are reused.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, LINES, SFX, TTS_MODEL, VOICES } from './course.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'audio', 'src');
const OUT = join(HERE, 'audio', 'out');
const DIALOGUE =
  process.env.DIALOGUE_SCRIPT ??
  '/Users/andersbj/Projekt/hooklinecoder/.claude/skills/elevenlabs-skill/scripts/generate_dialogue.py';
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Target loudness (LUFS) per kind of clip.
const LUFS = { voice: -16, sfx: -18, bed: -22 };

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const duration = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

function renderVoice(name) {
  const out = join(SRC, `voice_${name}.mp3`);
  const [role, text] = LINES[name];
  const input = join(SRC, `voice_${name}.json`);
  const json = JSON.stringify([{ text, voice_id: VOICES[role] }], null, 1);
  if (existsSync(out) && existsSync(input) && readFileSync(input, 'utf8') === json) return out;
  writeFileSync(input, json);
  console.log(`voice  ${name} (${role}, ${text.length} chars)`);
  execFileSync('python3', [DIALOGUE, '--input', input, '--output', out, '--model', TTS_MODEL], {
    stdio: 'inherit',
    env: process.env,
  });
  if (!existsSync(out)) throw new Error(`voice ${name} was not rendered`);
  return out;
}

async function renderSfx(name) {
  const out = join(SRC, `sfx_${name}.mp3`);
  const [text, seconds, loop] = SFX[name];
  const meta = join(SRC, `sfx_${name}.json`);
  const key = JSON.stringify({ text, seconds, loop });
  if (existsSync(out) && (!existsSync(meta) || readFileSync(meta, 'utf8') === key)) return out;
  console.log(`sfx    ${name} (${seconds}s${loop ? ', loop' : ''})`);
  const body = { text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) };
  let res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && loop) {
    // Older sound models don't take `loop`; fall back to a plain clip.
    console.log(`       loop rejected (${res.status}), retrying without it`);
    delete body.loop;
    res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(`sfx ${name}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  writeFileSync(meta, key);
  return out;
}

const sourceFile = (layer) => (layer.voice ? join(SRC, `voice_${layer.voice}.mp3`) : join(SRC, `sfx_${layer.sfx}.mp3`));

/** Loudness-normalise one file into the output clip. */
function normalise(input, out, lufs) {
  run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11`, '-ar', '44100', '-b:a', '128k', out]);
}

/** Layer a mix: voices placed at their start times, sfx optionally looped under them. */
function renderMix(name, spec, out) {
  const starts = {};
  let end = 0;
  for (const l of spec.mix) {
    if (!l.voice) continue;
    const at = l.after ? starts[l.after] + duration(sourceFile(spec.mix.find((x) => x.voice === l.after))) + (l.gap ?? 0) : l.at ?? 0;
    starts[l.voice] = at;
    end = Math.max(end, at + duration(sourceFile(l)));
  }
  const total = end + (spec.tail ?? 2);
  const args = ['-y', '-v', 'error'];
  const chains = [];
  spec.mix.forEach((l, i) => {
    if (l.loop) args.push('-stream_loop', '-1');
    args.push('-i', sourceFile(l));
    const at = l.voice ? starts[l.voice] : l.at ?? 0;
    const f = [];
    if (l.radio) f.push('highpass=f=350', 'lowpass=f=2800', 'acrusher=bits=10:mix=0.25');
    if (l.db) f.push(`volume=${l.db}dB`);
    if (at > 0) f.push(`adelay=${Math.round(at * 1000)}:all=1`);
    f.push(`apad`, `atrim=0:${total.toFixed(2)}`);
    chains.push(`[${i}:a]aresample=44100,${f.join(',')}[l${i}]`);
  });
  const fadeAt = Math.max(0, total - 1.5).toFixed(2);
  chains.push(
    `${spec.mix.map((_, i) => `[l${i}]`).join('')}amix=inputs=${spec.mix.length}:normalize=0,` +
      `afade=t=out:st=${fadeAt}:d=1.5,loudnorm=I=${LUFS.voice}:TP=-1.5:LRA=11[out]`
  );
  args.push('-filter_complex', chains.join(';'), '-map', '[out]', '-ar', '44100', '-b:a', '128k', out);
  run('ffmpeg', args);
}

async function main() {
  for (const name of Object.keys(LINES)) renderVoice(name);
  for (const name of Object.keys(SFX)) await renderSfx(name);

  const durations = {};
  for (const [name, spec] of Object.entries(CLIPS)) {
    const out = join(OUT, `${name}.mp3`);
    if (spec.file) {
      const src = join(HERE, 'audio', spec.file);
      if (!existsSync(src)) {
        console.log(`skip   ${name} (no ${spec.file} yet)`);
        continue;
      }
      normalise(src, out, LUFS.bed);
    } else if (spec.mix) {
      renderMix(name, spec, out);
    } else if (spec.voice) {
      normalise(join(SRC, `voice_${spec.voice}.mp3`), out, LUFS.voice);
    } else {
      normalise(join(SRC, `sfx_${spec.sfx}.mp3`), out, spec.bed ? LUFS.bed : LUFS.sfx);
    }
    durations[name] = Math.round(duration(out) * 10) / 10;
    console.log(`clip   ${name.padEnd(15)} ${durations[name]}s`);
  }
  writeFileSync(join(OUT, 'durations.json'), JSON.stringify(durations, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
