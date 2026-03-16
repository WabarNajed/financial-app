import { getDb } from '../database/connection';
import logger from '../utils/logger';

export interface GuardrailResult {
  passed: boolean;
  blockers: string[];
}

/**
 * Check if a product is safe to push to Salla.
 * Blocks on: missing images, supplier issues, missing supplier mapping.
 */
export async function checkExportGuardrails(productId: string): Promise<GuardrailResult> {
  const db = getDb();
  const blockers: string[] = [];

  const product = await db('products').where({ id: productId }).first();
  if (!product) return { passed: false, blockers: ['Product not found'] };

  // Check images
  const imageUrls = typeof product.image_urls === 'string'
    ? JSON.parse(product.image_urls) : (product.image_urls || []);
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    blockers.push('Product is missing images');
  }

  // Check supplier mapping
  const mapping = await db('supplier_mappings')
    .where({ product_id: productId, is_active: true })
    .first();
  if (!mapping) {
    blockers.push('No active supplier mapping');
  } else if (mapping.supplier_last_stock_status === 'out_of_stock' || mapping.supplier_last_stock_status === 'removed') {
    blockers.push(`Supplier issue: ${mapping.supplier_last_stock_status}`);
  }

  // Check approval status
  if (product.status !== 'approved' && product.status !== 'pushed_to_salla') {
    blockers.push(`Product status is "${product.status}", must be "approved"`);
  }

  const result: GuardrailResult = { passed: blockers.length === 0, blockers };
  if (!result.passed) {
    logger.warn(`[guardrails] product ${productId} blocked: ${blockers.join('; ')}`);
  }
  return result;
}

/**
 * Check if a product is safe for campaign creation.
 * Same rules as export + must have creatives.
 */
export async function checkCampaignGuardrails(productId: string): Promise<GuardrailResult> {
  const exportResult = await checkExportGuardrails(productId);
  const blockers = [...exportResult.blockers];

  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (product) {
    const meta = typeof product.metadata === 'string'
      ? JSON.parse(product.metadata) : (product.metadata || {});
    if (!meta.ad_creatives) {
      blockers.push('No ad creatives generated');
    }
  }

  return { passed: blockers.length === 0, blockers };
}
