// Passwords: scrypt (memory-hard, built into Node), a random salt per password, parameters
// stored with the hash so they can be raised later. Only the hash is stored, in its own table,
// never in the shop document that is sent to browsers.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 1 << 15; // CPU/memory cost (32 MiB with r=8)
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(pw.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const k = await scrypt(pw, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  const want = Buffer.from(key, 'base64url');
  return want.length === k.length && timingSafeEqual(want, k);
}

// Verifying against this when the name is unknown keeps response times the same, so the login
// form does not reveal which names have accounts.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')));

const COMMON = new Set(['passwort123', 'password123', 'minecraft1', 'minecraft123', '1234567890', 'qwertzuiop', 'qwertyuiop', 'passwort1234', 'password1234', '123456789a', 'iloveyou12', 'hallo12345']);

/** Returns an i18n key when the password is too weak, otherwise null. */
export function passwordProblem(pw: string, name: string): string | null {
  if (pw.length < 10) return 'err.pwShort';
  if (pw.length > 128) return 'err.pwLong';
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || lower.includes(name.toLowerCase()) || /^(.)\1+$/.test(pw)) return 'err.pwWeak';
  return null;
}
