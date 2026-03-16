import crypto from 'crypto';
import { env } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = env.JWT_SECRET || 'default-dev-encryption-key-change-me';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string for safe DB storage.
 * Returns base64-encoded string: iv:encrypted:tag
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(':')) return '';
  try {
    const [ivB64, encB64, tagB64] = ciphertext.split(':');
    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return '';
  }
}

/**
 * Mask a secret for display: show first 4 and last 4 chars.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value || value.length < 10) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
