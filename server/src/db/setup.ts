import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioPointInput, Coordinates } from '@audioworld/shared';
import { destinationPoint } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { applySchema, pool } from './pool';
import { createCourse, listCourses } from '../models/course';
import { create as createPoint } from '../models/point';

/** Demo center: central Stockholm. */
const CENTER: Coordinates = { lat: 59.3293, lng: 18.0686 };

const TONES = [
  { file: 'tone-220.wav', freq: 220.0 }, // A3
  { file: 'tone-277.wav', freq: 277.18 }, // C#4
  { file: 'tone-330.wav', freq: 329.63 }, // E4
  { file: 'tone-392.wav', freq: 392.0 }, // G4
  { file: 'tone-494.wav', freq: 493.88 }, // B4
] as const;

/**
 * Write a seamlessly-looping mono 16-bit PCM sine WAV at 44100 Hz.
 * The sample count is chosen to hold a whole number of periods, so the tail
 * lines up with the head and looping produces no click.
 */
function writeSineWav(filePath: string, freqHz: number, seconds: number): void {
  const sampleRate = 44100;
  const cycles = Math.max(1, Math.round(freqHz * seconds));
  const numSamples = Math.round((cycles * sampleRate) / freqHz);
  const amplitude = 0.4 * 0x7fff;
  const dataBytes = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM subchunk size
  buffer.writeUInt16LE(1, 20); // audio format = PCM
  buffer.writeUInt16LE(1, 22); // channels = 1
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate = rate * channels * bytesPerSample
  buffer.writeUInt16LE(2, 32); // block align = channels * bytesPerSample
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let n = 0; n < numSamples; n++) {
    const sample = Math.round(amplitude * Math.sin((2 * Math.PI * cycles * n) / numSamples));
    buffer.writeInt16LE(sample, 44 + n * 2);
  }

  writeFileSync(filePath, buffer);
}

/** The five demo points, one of each type, arranged around CENTER. */
function seedPoints(courseId: string): AudioPointInput[] {
  const common = {
    courseId,
    playback: { loop: true, stopAfter: false, reload: false },
    volume: 1,
    sync: 'individual',
  } as const;
  const url = (file: string) => ({ kind: 'url' as const, url: `/uploads/${file}` });

  return [
    {
      ...common,
      name: 'Static bell (N)',
      type: 'static',
      audio: { ...url('tone-220.wav'), title: 'Static bell' },
      center: destinationPoint(CENTER, 0, 50),
      radius: 60,
    },
    {
      ...common,
      name: 'Circling drone',
      type: 'static_circling',
      audio: { ...url('tone-277.wav'), title: 'Circling drone' },
      center: destinationPoint(CENTER, 90, 60),
      circleRadius: 40,
      speed: 6,
      radius: 50,
    },
    {
      ...common,
      name: 'Shared guide (global)',
      type: 'path',
      sync: 'global',
      audio: { ...url('tone-330.wav'), title: 'Shared guide' },
      path: [
        destinationPoint(CENTER, 200, 70),
        destinationPoint(CENTER, 170, 40),
        destinationPoint(CENTER, 140, 60),
        destinationPoint(CENTER, 110, 90),
      ],
      radius: 50,
      speed: 4,
      endBehavior: 'reverse',
    },
    {
      ...common,
      name: 'Follow-me hum',
      type: 'follow_user',
      audio: { ...url('tone-392.wav'), title: 'Follow-me hum' },
      center: destinationPoint(CENTER, 270, 40),
      initialRadius: 40,
    },
    {
      ...common,
      name: 'Triggered chime',
      type: 'path_triggered',
      audio: { ...url('tone-494.wav'), title: 'Triggered chime' },
      path: [
        destinationPoint(CENTER, 45, 30),
        destinationPoint(CENTER, 55, 80),
        destinationPoint(CENTER, 70, 130),
      ],
      triggerRadius: 45,
      speed: 5,
      endBehavior: 'loop',
    },
  ];
}

async function main(): Promise<void> {
  await applySchema();

  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const tone of TONES) {
    const target = join(UPLOAD_DIR, tone.file);
    if (!existsSync(target)) {
      writeSineWav(target, tone.freq, 4);
      console.log(`  synthesized ${tone.file}`);
    }
  }

  const courses = await listCourses();
  if (courses.length === 0) {
    const course = await createCourse({
      name: 'Stockholm Demo',
      description: 'One audio point of each type arranged around central Stockholm.',
    });
    for (const input of seedPoints(course.id)) {
      const point = await createPoint(course.id, input);
      console.log(`  seeded ${point.type} — ${point.name}`);
    }
    console.log(`Seeded course "${course.name}" (${course.id}) with 5 points.`);
  } else {
    console.log(`Courses already present (${courses.length}); skipping seed.`);
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed', err);
  process.exit(1);
});
