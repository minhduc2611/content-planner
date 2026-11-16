import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

// scrypt is built into Node and is a memory-hard password hash (no extra dependency)
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const hash = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEYLEN);
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// Used when the email doesn't exist, so response time doesn't reveal which emails are registered
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = token => createHash('sha256').update(token).digest('hex');

// shortcut: in-memory limiter, resets on restart and isn't shared across instances; move to Redis/DB if you run several
const attempts = new Map();
export function tooManyAttempts(key, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.start > windowMs) { attempts.set(key, { start: now, count: 1 }); return false; }
  return ++a.count > max;
}
