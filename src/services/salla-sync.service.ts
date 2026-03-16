import { getDb } from '../database/connection';
import { SallaIntegration } from '../integrations/salla';
import { buildSallaPayload } from './export-payload-builder.service';
import { validateExportReadiness } from './export-validation.service';
import { decrypt } from '../utils/crypto';
import logger from '../utils/logger';

/**
 * Get Salla integration config from DB (dashboard-configurable).
 * Decrypts secrets if they were stored encrypted.
 */
export async function getSallaConfig(): Promise<any | null> {
  const db = getDb();
  const config = await db('integrations_salla').where({ is_active: true }).first();
  if (!config) return null;

  // Try to decrypt fields (if encrypted they contain ':' separators)
  return {
    ...config,
    client_id: tryDecrypt(config.client_id),
    client_secret: tryDecrypt(config.client_secret),
    access_token: tryDecrypt(config.access_token),
    refresh_token: tryDecrypt(config.refresh_token),
    webhook_secret: tryDecrypt(config.webhook_secret),
  };
}

/**
 * Try to decrypt a value. If it doesn't look encrypted, return as-is.
 */
function tryDecrypt(value: string | null): string {
  if (!value) return '';
  // Encrypted values have format iv:encrypted:tag (base64:base64:base64)
  if (value.includes(':') && value.split(':').length === 3) {
    const decrypted = decrypt(value);
    return decrypted || value;
  }
  return value;
}

/**
 * Test Salla connection using dashboard-configured credentials.
 */
export async function testSallaConnection(): Promise<{ connected: boolean; store_name?: string; error?: string }> {
  try {
    const config = await getSallaConfig();
    if (!config) return { connected: false, error: 'No active Salla integration configured' };

    const token = config.access_token;
    if (!token) return { connected: false, error: 'No access token configured' };

    const response = await fetch('https://api.salla.dev/admin/v2/store/info', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return { connected: false, error: `HTTP ${response.status}` };

    const json: any = await response.json();
    const storeName = json?.data?.name || 'Unknown Store';

    // Update store name and test status
    await getDb()('integrations_salla').where({ id: config.id }).update({
      store_name: storeName,
      last_test_status: 'success',
      last_test_message: `Connected to ${storeName}`,
      updated_at: new Date(),
    });

    logger.info(`[salla-sync] connection test passed: store=${storeName}`);
    return { connected: true, store_name: storeName };
  } catch (err: any) {
    logger.error(`[salla-sync] connection test failed: ${err?.message}`);

    // Update test status
    try {
      const config = await getDb()('integrations_salla').first();
      if (config) {
        await getDb()('integrations_salla').where({ id: config.id }).update({
          last_test_status: 'failed',
          last_test_message: err?.message || 'Connection failed',
          updated_at: new Date(),
        });
      }
    } catch { /* ignore */ }

    return { connected: false, error: err?.message };
  }
}

/**
 * Create a product in Salla and save the mapping.
 */
export async function createProductInSalla(productId: string): Promise<{ success: boolean; salla_product_id?: string; error?: string }> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return { success: false, error: 'Product not found' };

  const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
  const commerce = meta.commerce || null;
  const listingPack = meta.listing_pack || null;

  const validation = validateExportReadiness(product, commerce, listingPack);
  if (!validation.valid) return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };

  const payload = buildSallaPayload(commerce, listingPack);

  try {
    const salla = new SallaIntegration();
    if (!salla.isConfigured()) {
      // Try DB-based config
      const config = await getSallaConfig();
      if (!config?.access_token) return { success: false, error: 'Salla not configured (no env or DB credentials)' };
    }

    const result = await salla.createProduct(payload);
    const sallaProductId = result?.id ? String(result.id) : null;

    if (sallaProductId) {
      await db('products').where({ id: productId }).update({
        salla_product_id: sallaProductId,
        status: 'pushed_to_salla',
        updated_at: new Date(),
      });
      logger.info(`[salla-sync] product created: internal=${productId} salla=${sallaProductId}`);
    }

    return { success: true, salla_product_id: sallaProductId || undefined };
  } catch (err: any) {
    logger.error(`[salla-sync] create failed: ${err?.message}`);
    return { success: false, error: err?.message };
  }
}

/**
 * Disable a product in Salla (set status to hidden/draft).
 */
export async function disableProductInSalla(productId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product?.salla_product_id) return { success: false, error: 'No Salla product ID' };

  try {
    const salla = new SallaIntegration();
    await salla.updateProduct(product.salla_product_id, { status: 'hidden' });
    logger.info(`[salla-sync] product disabled in Salla: ${product.salla_product_id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
