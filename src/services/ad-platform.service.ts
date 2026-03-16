import { getDb } from '../database/connection';
import { encrypt, decrypt, maskSecret } from '../utils/crypto';
import logger from '../utils/logger';

export type AdPlatform = 'tiktok_ads' | 'snapchat_ads' | 'meta_ads';

export interface AdPlatformInput {
  platform: AdPlatform;
  account_name?: string;
  api_key?: string;
  api_secret?: string;
  access_token?: string;
  refresh_token?: string;
  payment_card_holder?: string;
  payment_card_last4?: string;
  billing_reference?: string;
  mode?: 'simulation' | 'live';
}

/**
 * List all ad platform credentials (secrets masked).
 */
export async function listAdPlatforms(): Promise<any[]> {
  const db = getDb();
  const rows = await db('ad_platform_credentials').orderBy('platform');
  return rows.map(maskRow);
}

/**
 * Get a single ad platform credential by platform name (masked).
 */
export async function getAdPlatform(platform: string): Promise<any | null> {
  const db = getDb();
  const row = await db('ad_platform_credentials').where({ platform }).first();
  return row ? maskRow(row) : null;
}

/**
 * Upsert ad platform credentials with encryption.
 */
export async function upsertAdPlatform(input: AdPlatformInput): Promise<any> {
  const db = getDb();
  const existing = await db('ad_platform_credentials').where({ platform: input.platform }).first();

  const data: any = {
    platform: input.platform,
    account_name: input.account_name || null,
    payment_card_holder: input.payment_card_holder || null,
    payment_card_last4: input.payment_card_last4 || null,
    billing_reference: input.billing_reference || null,
    mode: input.mode || 'simulation',
    updated_at: new Date(),
  };

  // Encrypt secrets
  if (input.api_key) data.api_key_encrypted = encrypt(input.api_key);
  if (input.api_secret) data.api_secret_encrypted = encrypt(input.api_secret);
  if (input.access_token) data.access_token_encrypted = encrypt(input.access_token);
  if (input.refresh_token) data.refresh_token_encrypted = encrypt(input.refresh_token);

  if (existing) {
    await db('ad_platform_credentials').where({ id: existing.id }).update(data);
    logger.info(`[ad-platform] updated: ${input.platform}`);
    return { id: existing.id, updated: true };
  } else {
    const [row] = await db('ad_platform_credentials').insert(data).returning('id');
    logger.info(`[ad-platform] created: ${input.platform}`);
    return { id: row.id, created: true };
  }
}

/**
 * Enable/disable an ad platform.
 */
export async function setAdPlatformActive(platform: string, isActive: boolean): Promise<boolean> {
  const db = getDb();
  const updated = await db('ad_platform_credentials')
    .where({ platform })
    .update({ is_active: isActive, updated_at: new Date() });
  return updated > 0;
}

/**
 * Set mode (simulation/live) for an ad platform.
 */
export async function setAdPlatformMode(platform: string, mode: 'simulation' | 'live'): Promise<boolean> {
  const db = getDb();
  const updated = await db('ad_platform_credentials')
    .where({ platform })
    .update({ mode, updated_at: new Date() });
  return updated > 0;
}

function maskRow(row: any): any {
  return {
    id: row.id,
    platform: row.platform,
    account_name: row.account_name,
    api_key: row.api_key_encrypted ? maskSecret(decrypt(row.api_key_encrypted)) : null,
    api_secret: row.api_secret_encrypted ? maskSecret(decrypt(row.api_secret_encrypted)) : null,
    access_token: row.access_token_encrypted ? maskSecret(decrypt(row.access_token_encrypted)) : null,
    refresh_token: row.refresh_token_encrypted ? maskSecret(decrypt(row.refresh_token_encrypted)) : null,
    has_api_key: !!row.api_key_encrypted,
    has_api_secret: !!row.api_secret_encrypted,
    has_access_token: !!row.access_token_encrypted,
    has_refresh_token: !!row.refresh_token_encrypted,
    payment_card_holder: row.payment_card_holder,
    payment_card_last4: row.payment_card_last4 ? `••••${row.payment_card_last4}` : null,
    billing_reference: row.billing_reference,
    is_active: row.is_active,
    mode: row.mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
