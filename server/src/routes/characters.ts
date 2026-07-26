import { Router } from 'express';
import type { CharacterInput } from '@audioworld/shared';
import * as Characters from '../models/character';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { canManageCourse, requireRole, type AuthedRequest } from '../lib/auth';

export const charactersRouter = Router();

// Characters are an authoring artifact — same roles as course authoring.
charactersRouter.use(requireRole('superuser', 'admin'));

async function loadManageable(req: AuthedRequest, res: import('express').Response) {
  const c = await Characters.getCharacter(req.params.id);
  if (!c) {
    res.status(404).json({ success: false, error: 'Character not found' });
    return null;
  }
  if (!canManageCourse(req.user, c.ownerId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this character' });
    return null;
  }
  return c;
}

function parseInput(body: unknown): CharacterInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    throw new ValidationError('A character "name" is required');
  }
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const url = typeof b.idleSoundUrl === 'string' && b.idleSoundUrl.startsWith('/uploads/')
    ? b.idleSoundUrl.slice(0, 200)
    : undefined;
  return {
    name: b.name.trim().slice(0, 120),
    persona: str(b.persona, 4000),
    voiceId: str(b.voiceId, 120),
    voiceName: typeof b.voiceName === 'string' ? b.voiceName.slice(0, 120) : undefined,
    idleSoundUrl: url,
  };
}

charactersRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await Characters.listCharacters(req.user!.id, req.user!.role === 'admin');
    res.json({ success: true, data });
  })
);

charactersRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await Characters.createCharacter(parseInput(req.body), req.user!.id);
    res.status(201).json({ success: true, data });
  })
);

charactersRouter.put(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    const data = await Characters.updateCharacter(req.params.id, parseInput(req.body));
    res.json({ success: true, data });
  })
);

charactersRouter.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!(await loadManageable(req, res))) return;
    await Characters.removeCharacter(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  })
);
