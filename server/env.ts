// All configuration comes from environment variables (Vercel → Settings → Environment Variables,
// never committed). Without DATABASE_URL and APP_SECRET the API reports "beta" and the site keeps
// running in the browser, so nothing half-configured ever goes live.
//
//   DATABASE_URL         added by the Neon integration
//   APP_SECRET           secret, ≥ 32 chars, root of all derived keys
//   CRON_SECRET          secret, Vercel Cron sends it to /api/cron
//   MS_CLIENT_ID         Azure app (client) id, not secret
//   MS_CLIENT_SECRET     Azure client secret value
//   SITE_URL             public origin, e.g. https://stackr-alpha.vercel.app (must match the
//                        redirect URI registered in Azure + /api/auth/microsoft/callback)
//   SELLER_MC_UUID       the seller's Minecraft UUID (with or without dashes)

export interface Env {
  databaseUrl: string;
  appSecret: string;
  sellerUuid: string;
  msClientId: string;
  msClientSecret: string;
  siteUrl: string;
  cronSecret: string;
  production: boolean;
}

const clean = (v: string | undefined) => (v ?? '').trim();

export function readEnv(src: Record<string, string | undefined> = process.env): Env | null {
  const databaseUrl = clean(src.DATABASE_URL || src.POSTGRES_URL);
  const appSecret = clean(src.APP_SECRET);
  if (!databaseUrl || appSecret.length < 32) return null;
  return {
    databaseUrl,
    appSecret,
    sellerUuid: clean(src.SELLER_MC_UUID).toLowerCase().replace(/-/g, ''),
    msClientId: clean(src.MS_CLIENT_ID),
    msClientSecret: clean(src.MS_CLIENT_SECRET),
    siteUrl: clean(src.SITE_URL).replace(/\/+$/, ''),
    cronSecret: clean(src.CRON_SECRET),
    production: src.VERCEL_ENV === 'production',
  };
}

/** Microsoft sign-in is usable only when the app is fully configured. */
export const msReady = (env: Env) =>
  !!(env.msClientId && env.msClientSecret && /^https:\/\/[^/]+$|^http:\/\/localhost(:\d+)?$/.test(env.siteUrl));
