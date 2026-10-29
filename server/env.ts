// All configuration comes from environment variables (set in Vercel → Settings → Environment
// Variables, never committed). If the required ones are missing, the API reports "beta" and the
// site keeps running fully in the browser, so nothing half-configured ever goes live.

export interface Env {
  databaseUrl: string;
  appSecret: string;
  sellerUuid: string; // Minecraft UUID of the seller, 32 hex chars without dashes
  mcAuthUrl: string; // base URL of the mc-oauth API behind the reverse proxy
  mcAuthKey: string; // shared secret the reverse proxy requires
  mcJoinHost: string; // address players join to get their code, shown on the sign-in page
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
    mcAuthUrl: clean(src.MC_AUTH_URL).replace(/\/+$/, ''),
    mcAuthKey: clean(src.MC_AUTH_KEY),
    mcJoinHost: clean(src.MC_JOIN_HOST),
    cronSecret: clean(src.CRON_SECRET),
    production: src.VERCEL_ENV === 'production',
  };
}
