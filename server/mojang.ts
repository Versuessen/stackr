// Checks that a Minecraft Java name exists, via Mojang's public name lookup (no login, no app
// approval). Returns the exact spelling and the UUID, which stays the same when a player renames.
// If Mojang is unreachable, sign-up still works; the UUID is then left empty.

import { z } from 'zod';
import { HttpError } from './http.js';

const res = z.object({ id: z.string().regex(/^[0-9a-fA-F]{32}$/), name: z.string().regex(/^[A-Za-z0-9_]{3,16}$/) });

export async function lookupName(name: string): Promise<{ name: string; uuid: string }> {
  let r: Response;
  try {
    r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
      headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4000),
    });
  } catch {
    return { name, uuid: '' }; // Mojang down: accept the typed name, the seller confirms it anyway
  }
  if (r.status === 404 || r.status === 204) throw new HttpError(422, 'err.nameUnknown');
  if (!r.ok) return { name, uuid: '' };
  const p = res.safeParse(await r.json().catch(() => null));
  if (!p.success) return { name, uuid: '' };
  return { name: p.data.name, uuid: p.data.id.toLowerCase() };
}
