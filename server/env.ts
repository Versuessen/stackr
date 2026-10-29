// All configuration comes from environment variables (Vercel → Settings → Environment Variables,
// never committed). Without DATABASE_URL and APP_SECRET the API reports "beta" and the site keeps
// running in the browser, so nothing half-configured ever goes live.
//
//   DATABASE_URL        added by the Neon integration
//   APP_SECRET          secret, ≥ 32 chars, root of all derived keys
//   CRON_SECRET         secret, Vercel Cron sends it to /api/cron
//   SELLER_SETUP_CODE   secret, ≥ 16 chars: entered once as the "invite code" when the seller
//                       creates their account; afterwards it does nothing

export interface Env {
  databaseUrl: string;
  appSecret: string;
  sellerSetupCode: string;
  cronSecret: string;
  production: boolean;
}

const clean = (v: string | undefined) => (v ?? '').trim();

export function readEnv(src: Record<string, string | undefined> = process.env): Env | null {
  const databaseUrl = clean(src.DATABASE_URL || src.POSTGRES_URL);
  const appSecret = clean(src.APP_SECRET);
  if (!databaseUrl || appSecret.length < 32) return null;
  const setup = clean(src.SELLER_SETUP_CODE);
  return {
    databaseUrl,
    appSecret,
    sellerSetupCode: setup.length >= 16 ? setup : '',
    cronSecret: clean(src.CRON_SECRET),
    production: src.VERCEL_ENV === 'production',
  };
}
