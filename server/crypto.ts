// Small crypto helpers on Node's built-in module. No secrets live in code: every key is
// derived from APP_SECRET (an environment variable) with HKDF, one sub-key per purpose.

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const keyCache = new Map<string, Buffer>();
export function subKey(secret: string, purpose: string): Buffer {
  const id = `${sha256(secret).slice(0, 12)}:${purpose}`;
  let k = keyCache.get(id);
  if (!k) {
    k = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('stackr'), Buffer.from(purpose), 32));
    keyCache.set(id, k);
  }
  return k;
}

export const hmac = (key: Buffer, s: string) => createHmac('sha256', key).update(s).digest('base64url');

/** AES-256-GCM. Output: iv.tag.ciphertext, all base64url. */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(key: Buffer, packed: string): string {
  const [iv, tag, body] = packed.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

// ---------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s), works with any authenticator app ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Returns the matched time step (to block replays), or null. Accepts ±1 step of clock drift. */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), lastStep = -1): number | null {
  const c = code.replace(/\D/g, '');
  if (c.length !== 6) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) {
    if (s > lastStep && safeEqual(totpAt(secretB32, s), c)) return s;
  }
  return null;
}

export function newTotpSecret() { return base32(randomBytes(20)); }

export function recoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32(randomBytes(8)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z2-7]/g, '');
