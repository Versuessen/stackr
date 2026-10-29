// "Sign in with Microsoft" for Minecraft Java accounts, the same chain the official launcher uses:
//   Microsoft OAuth (consumers tenant, auth code + PKCE)
//   → Xbox Live user token → XSTS token for api.minecraftservices.com
//   → Minecraft access token → /minecraft/profile (name + UUID).
// The tokens are used once, inside this request, and then dropped: Stackr never stores a
// Microsoft, Xbox or Minecraft token and never sees a password or email address.
// Note: Mojang must approve the Azure app id (https://aka.ms/mce-reviewappid). Until then the
// Minecraft step answers 403 and the user sees "sign-in not activated yet".

import { z } from 'zod';
import type { Env } from './env.js';

export const MS_AUTHORIZE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
export const MS_TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const XBL_AUTH = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_LOGIN = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile';
export const MS_SCOPE = 'XboxLive.signin';

/** Reasons the browser can be told about (mapped to translated messages). */
export type MsFail = 'cancelled' | 'expired' | 'noXbox' | 'child' | 'xboxBlocked' | 'notApproved' | 'noProfile' | 'unavailable';
export class MsAuthError extends Error { constructor(public reason: MsFail) { super(reason); } }

export const redirectUri = (env: Env) => `${env.siteUrl}/api/auth/microsoft/callback`;

export function authorizeUrl(env: Env, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: env.msClientId,
    response_type: 'code',
    redirect_uri: redirectUri(env),
    response_mode: 'query',
    scope: MS_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${MS_AUTHORIZE}?${q}`;
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch {
    throw new MsAuthError('unavailable');
  }
}
const jsonHeaders = { 'content-type': 'application/json', accept: 'application/json' };

const tokenRes = z.object({ access_token: z.string().min(10) });
const xblRes = z.object({ Token: z.string().min(10), DisplayClaims: z.object({ xui: z.array(z.object({ uhs: z.string().min(1) })).min(1) }) });
const mcLoginRes = z.object({ access_token: z.string().min(10) });
const profileRes = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{32}$/).transform((s) => s.toLowerCase()),
  name: z.string().regex(/^[A-Za-z0-9_]{3,16}$/),
});

/** Exchanges the authorization code for the player's Minecraft name and UUID. */
export async function minecraftIdentity(env: Env, code: string, verifier: string): Promise<{ name: string; uuid: string }> {
  // 1. Microsoft
  const t = await call(MS_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.msClientId, client_secret: env.msClientSecret, grant_type: 'authorization_code',
      code, redirect_uri: redirectUri(env), code_verifier: verifier, scope: MS_SCOPE,
    }),
  });
  if (t.status === 400) throw new MsAuthError('expired');
  if (!t.ok) throw new MsAuthError('unavailable');
  const ms = tokenRes.safeParse(await t.json().catch(() => null));
  if (!ms.success) throw new MsAuthError('unavailable');

  // 2. Xbox Live
  const x = await call(XBL_AUTH, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${ms.data.access_token}` },
      RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
    }),
  });
  if (!x.ok) throw new MsAuthError('unavailable');
  const xbl = xblRes.safeParse(await x.json().catch(() => null));
  if (!xbl.success) throw new MsAuthError('unavailable');

  // 3. XSTS for Minecraft services
  const s = await call(XSTS_AUTH, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
    }),
  });
  if (s.status === 401) {
    const err = (await s.json().catch(() => ({}))) as { XErr?: number };
    if (err.XErr === 2148916233) throw new MsAuthError('noXbox');
    if (err.XErr === 2148916238) throw new MsAuthError('child');
    throw new MsAuthError('xboxBlocked'); // banned, region, adult verification, unknown
  }
  if (!s.ok) throw new MsAuthError('unavailable');
  const xsts = xblRes.safeParse(await s.json().catch(() => null));
  if (!xsts.success) throw new MsAuthError('unavailable');

  // 4. Minecraft
  const m = await call(MC_LOGIN, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ identityToken: `XBL3.0 x=${xsts.data.DisplayClaims.xui[0].uhs};${xsts.data.Token}` }),
  });
  if (m.status === 403) throw new MsAuthError('notApproved');
  if (!m.ok) throw new MsAuthError('unavailable');
  const mc = mcLoginRes.safeParse(await m.json().catch(() => null));
  if (!mc.success) throw new MsAuthError('unavailable');

  // 5. Profile: exists only for accounts that own Minecraft Java (or Game Pass after first launch)
  const p = await call(MC_PROFILE, { headers: { authorization: `Bearer ${mc.data.access_token}`, accept: 'application/json' } });
  if (p.status === 404) throw new MsAuthError('noProfile');
  if (!p.ok) throw new MsAuthError('unavailable');
  const prof = profileRes.safeParse(await p.json().catch(() => null));
  if (!prof.success) throw new MsAuthError('noProfile');
  return { name: prof.data.name, uuid: prof.data.id };
}
