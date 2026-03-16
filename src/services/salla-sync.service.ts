import { getDb } from '../database/connection';
import { SallaIntegration } from '../integrations/salla';
import { buildSallaPayload } from './export-payload-builder.service';
import { validateExportReadiness } from './export-validation.service';
import logger from '../utils/logger';

/**
 * Get Salla integration config from DB (dashboard-configurable).
 */
export async function getSallaConfig(): Promise<any | null> {
  const db = getDb();
  return db('integrations_salla').where({ is_active: true }).first();
}

/**
 * Test Salla connection using dashboard-configured credentials.
 */
export async function testSallaConnection(): Promise<{ connected: boolean; store_name?: string; error?: string }> {
  try {
    const config = await getSallaConfig();
    if (!config) return { connected: false, error: 'No active Salla integration configured' };

    const response = await fetch('https://api.salla.dev/admin/v2/store/info', {
      headers: { Authorization: `Bearer ${config.access_token}` },
    });

    if (!response.ok) return { connected: false, error: `HTTP ${response.status}` };

    const json: any = await response.json();
    const storeName = json?.data?.name || 'Unknown Store';

    // Update store name
    await getDb()('integrations_salla').where({ id: config.id }).update({
      store_name: storeName,
      updated_at: new Date(),
    });

    logger.info(`[salla-sync] connection test passed: store=${storeName}`);
    return { connected: true, store_name: storeName };
  } catch (err: any) {
    logger.error(`[salla-sync] connection test failed: ${err?.message}`);
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
    if (!salla.isConfigured()) return { success: false, error: 'Salla not configured' };

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
