import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClipKind, UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { setMeta } from '../models/upload';
import { ElevenError } from './eleven';

/** Hard cap on a single generated file (defence-in-depth; real mp3s are far smaller). */
const MAX_GENERATED_BYTES = 30 * 1024 * 1024;

/** Persist generated mp3 bytes into the sound library, exactly like an upload. */
export async function saveToLibrary(bytes: Buffer, description: string, kind: ClipKind): Promise<UploadResult> {
  if (bytes.length > MAX_GENERATED_BYTES) {
    throw new ElevenError('Generated audio was unexpectedly large', 502);
  }
  const filename = `${randomUUID()}.mp3`;
  writeFileSync(join(UPLOAD_DIR, filename), bytes);
  await setMeta(filename, description.slice(0, 200), kind);
  return { url: `/uploads/${filename}`, filename, size: bytes.length, mimetype: 'audio/mpeg' };
}
