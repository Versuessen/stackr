// Minecraft account check through a self-hosted mc-oauth-rs server
// (https://github.com/Andcool-Systems/mc-oauth-rs). The player joins that server, Mojang's
// session check proves they own the account, and they are kicked with a one-time 6-digit code
// (valid 5 minutes, single use). Here the code is exchanged for nickname + UUID.
// The API sits behind a reverse proxy that requires MC_AUTH_KEY, so only this backend can redeem codes.

import type { Env } from './env.js';
import { HttpError } from './http.js';
import { mcOauthResponse } from './schemas.js';

export async function redeemCode(env: Env, code: string): Promise<{ name: string; uuid: string } | null> {
  if (!env.mcAuthUrl || !env.mcAuthKey) throw new HttpError(503, 'err.authOffline');
  if (env.production && !env.mcAuthUrl.startsWith('https://')) throw new HttpError(503, 'err.authOffline');
  let res: Response;
  try {
    res = await fetch(`${env.mcAuthUrl}/code/${encodeURIComponent(code)}`, {
      headers: { 'x-stackr-key': env.mcAuthKey, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new HttpError(503, 'err.authOffline');
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new HttpError(503, 'err.authOffline');
  const parsed = mcOauthResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new HttpError(503, 'err.authOffline');
  return { name: parsed.data.nickname, uuid: parsed.data.UUID };
}
