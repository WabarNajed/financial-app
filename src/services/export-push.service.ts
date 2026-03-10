import { getDb } from '../database/connection';
import { ProductRepo } from '../database/repositories';
import { SallaIntegration } from '../integrations/salla';
import { SallaProductPayload } from '../types';
import { validateExportReadiness } from './export-validation.service';
import { buildSallaPayload, SallaExportPayload } from './export-payload-builder.service';
import { CommercePackage, ListingPack } from '../discovery/types';
import { env } from '../config';
import logger from '../utils/logger';

export interface PushResult {
  success: boolean;
  product_id: string;
  salla_product_id?: string;
  sync_status: 'success' | 'failed' | 'not_configured';
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
  required_env?: string[];
}

const REQUIRED_SALLA_ENV = ['SALLA_CLIENT_ID', 'SALLA_CLIENT_SECRET', 'SALLA_ACCESS_TOKEN'];

/**
 * Check whether Salla credentials are configured.
 */
function checkSallaCredentials(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!env.SALLA_CLIENT_ID) missing.push('SALLA_CLIENT_ID');
  if (!env.SALLA_CLIENT_SECRET) missing.push('SALLA_CLIENT_SECRET');
  if (!env.SALLA_ACCESS_TOKEN) missing.push('SALLA_ACCESS_TOKEN');
  return { configured: missing.length === 0, missing };
}

/**
 * Convert our SallaExportPayload into the SallaProductPayload expected by the integration.
 */
function toSallaApiPayload(exportPayload: SallaExportPayload): SallaProductPayload {
  return {
    name: exportPayload.name,
    description: exportPayload.description,
    price: exportPayload.price,
    compare_price: exportPayload.price,
    cost_price: exportPayload.sale_price,
    sku: exportPayload.sku,
    quantity: exportPayload.quantity,
    status: exportPayload.status,
    metadata: exportPayload.metadata,
  };
}

/**
 * Persist Salla sync result into the product record.
 */
async function persistSyncResult(
  productId: string,
  sallaProductId: string | null,
  syncStatus: 'success' | 'failed',
  error: string | null,
): Promise<void> {
  const db = getDb();
  const row = await db('products').where({ id: productId }).first();
  const existingMeta = typeof row?.metadata === 'string' ? JSON.parse(row.metadata) : (row?.metadata || {});

  const syncMeta = {
    ...existingMeta,
    salla_sync_status: syncStatus,
    pushed_to_salla_at: syncStatus === 'success' ? new Date().toISOString() : existingMeta.pushed_to_salla_at,
    salla_last_error: error,
  };

  const update: Record<string, any> = {
    metadata: JSON.stringify(syncMeta),
    updated_at: new Date(),
  };

  if (sallaProductId) {
    update.salla_product_id = sallaProductId;
    update.status = 'pushed_to_salla';
  }

  await db('products').where({ id: productId }).update(update);
}

/**
 * Push an approved, export-ready product to Salla.
 */
export async function pushToSalla(productId: string): Promise<PushResult> {
  logger.info(`[salla-push] push requested for product ${productId}`);

  // 1. Fetch product
  const product = await ProductRepo.findById(productId);
  if (!product) {
    logger.warn(`[salla-push] product ${productId} not found`);
    return { success: false, product_id: productId, sync_status: 'failed', error: 'Product not found' };
  }

  // 2. Extract metadata
  const metadata = (typeof product.metadata === 'string' ? JSON.parse(product.metadata) : product.metadata) || {};
  const commerce: CommercePackage | null = metadata.commerce || null;
  const listingPack: ListingPack | null = metadata.listing_pack || null;

  // 3. Validate export readiness
  const validation = validateExportReadiness(product, commerce, listingPack);
  if (!validation.valid) {
    logger.warn(`[salla-push] product ${productId} not export ready`, { errors: validation.errors });
    return {
      success: false,
      product_id: productId,
      sync_status: 'failed',
      error: 'Product is not export ready',
      details: { validation_errors: validation.errors },
    };
  }

  // 4. Check Salla credentials
  const creds = checkSallaCredentials();
  if (!creds.configured) {
    logger.warn(`[salla-push] Salla credentials missing: ${creds.missing.join(', ')}`);
    return {
      success: false,
      product_id: productId,
      sync_status: 'not_configured',
      error: 'Salla credentials are missing',
      required_env: REQUIRED_SALLA_ENV,
    };
  }

  // 5. Build payload
  const exportPayload = buildSallaPayload(commerce!, listingPack!);
  const apiPayload = toSallaApiPayload(exportPayload);

  logger.info(`[salla-push] pushing product ${productId} to Salla`, {
    sku: exportPayload.sku,
    price: exportPayload.price,
    sale_price: exportPayload.sale_price,
  });

  // 6. Call Salla API
  try {
    const salla = new SallaIntegration();
    const result = await salla.createProduct(apiPayload);

    const sallaProductId = String(result.id);

    // 7. Persist success
    await persistSyncResult(productId, sallaProductId, 'success', null);

    logger.info(`[salla-push] product ${productId} pushed successfully — salla_id=${sallaProductId}`);

    return {
      success: true,
      product_id: productId,
      salla_product_id: sallaProductId,
      sync_status: 'success',
      message: 'Product pushed to Salla successfully',
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);

    // Persist failure
    try {
      await persistSyncResult(productId, null, 'failed', errorMsg);
    } catch (persistErr: any) {
      logger.error(`[salla-push] failed to persist sync error for ${productId}: ${persistErr?.message}`);
    }

    logger.error(`[salla-push] push failed for product ${productId}: ${errorMsg}`);

    return {
      success: false,
      product_id: productId,
      sync_status: 'failed',
      error: errorMsg,
      details: { response: err?.response?.data },
    };
  }
}
