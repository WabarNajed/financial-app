import { getDb } from '../database/connection';
import { DiscoveredProduct as DiscoveryProduct } from '../discovery/types';
import { generateCommercePackage, generateListingPack } from './discovery-marketing.service';
import logger from '../utils/logger';

export interface RebuildResult {
  success: boolean;
  product_id: string;
  commerce_restored: boolean;
  listing_pack_restored: boolean;
  error?: string;
}

export interface BulkRebuildResult {
  success: boolean;
  repaired_count: number;
  product_ids: string[];
  errors: string[];
}

/**
 * Convert a DB product row into the DiscoveryProduct shape needed by the
 * commerce/listing_pack generators. Handles JSON parsing of stored fields.
 */
function toDiscoveryProduct(row: any): DiscoveryProduct {
  const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
  const keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords || []);
  const imageUrls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);

  return {
    id: row.id,
    name: row.name,
    name_ar: row.name_ar || null,
    category: row.category || 'general',
    source: row.source || 'unknown',
    source_url: row.source_url || '',
    price: metadata.price || null,
    currency: metadata.currency || null,
    rating: metadata.rating || null,
    review_count: metadata.review_count || null,
    image_url: imageUrls[0] || null,
    keywords,
    trend_signal: row.trend_signal || null,
    virality_score: row.virality_score ?? 50,
    impulse_buy_score: row.impulse_buy_score ?? 50,
    saudi_relevance_score: row.saudi_relevance_score ?? 50,
    supplier_trust_score: metadata.supplier_trust_score ?? 50,
    shipping_score: metadata.shipping_score ?? 50,
    margin_score: metadata.margin_score ?? 50,
    competition_score: metadata.competition_score ?? 50,
    trend_score: metadata.trend_score ?? 50,
    final_score: metadata.final_score ?? row.final_score ?? 50,
    metadata,
  };
}

/**
 * Rebuild export metadata (commerce + listing_pack) for a single product.
 */
export async function rebuildExportData(productId: string): Promise<RebuildResult> {
  const db = getDb();

  const row = await db('products').where({ id: productId }).first();
  if (!row) {
    return { success: false, product_id: productId, commerce_restored: false, listing_pack_restored: false, error: 'Product not found' };
  }

  // Also pull score data if available (for more accurate generation)
  const scoreRow = await db('product_scores').where({ product_id: productId }).first();

  const product = toDiscoveryProduct(row);

  // Override scores from product_scores table if available
  if (scoreRow) {
    product.trend_score = scoreRow.trend_score ?? product.trend_score;
    product.virality_score = scoreRow.virality_score ?? product.virality_score;
    product.shipping_score = scoreRow.shipping_score ?? product.shipping_score;
    product.margin_score = scoreRow.margin_score ?? product.margin_score;
    product.competition_score = scoreRow.competition_score ?? product.competition_score;
    product.supplier_trust_score = scoreRow.supplier_trust_score ?? product.supplier_trust_score;
    product.final_score = scoreRow.final_score ?? product.final_score;
    product.impulse_buy_score = row.impulse_buy_score ?? product.impulse_buy_score;
  }

  let commerceRestored = false;
  let listingPackRestored = false;

  try {
    // Generate commerce
    const commerce = await generateCommercePackage(product);
    product.commerce = commerce;
    commerceRestored = true;
    logger.info(`[rebuild] commerce generated for product ${productId}`);

    // Generate listing_pack (depends on commerce being set)
    const listingPack = generateListingPack(product);
    product.listing_pack = listingPack;
    listingPackRestored = true;
    logger.info(`[rebuild] listing_pack generated for product ${productId}`);

    // Merge into existing metadata and save
    const existingMeta = (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}));
    const merged = { ...existingMeta, commerce, listing_pack: listingPack };

    await db('products').where({ id: productId }).update({
      metadata: JSON.stringify(merged),
      updated_at: new Date(),
    });

    logger.info(`[rebuild] metadata saved for product ${productId}`);

    return { success: true, product_id: productId, commerce_restored: commerceRestored, listing_pack_restored: listingPackRestored };
  } catch (err: any) {
    const msg = `Rebuild failed for ${productId}: ${err?.message || err}`;
    logger.error(`[rebuild] ${msg}`);
    return { success: false, product_id: productId, commerce_restored: commerceRestored, listing_pack_restored: listingPackRestored, error: msg };
  }
}

/**
 * Find all products missing commerce or listing_pack in metadata, rebuild them.
 */
export async function rebuildMissingExportData(): Promise<BulkRebuildResult> {
  const db = getDb();
  const result: BulkRebuildResult = { success: true, repaired_count: 0, product_ids: [], errors: [] };

  // Fetch all products
  const rows = await db('products').select('id', 'metadata');

  const needsRepair: string[] = [];
  for (const row of rows) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    if (!meta.commerce || !meta.listing_pack) {
      needsRepair.push(row.id);
    }
  }

  logger.info(`[rebuild-bulk] found ${needsRepair.length} products missing export metadata`);

  for (const productId of needsRepair) {
    const rebuildResult = await rebuildExportData(productId);
    if (rebuildResult.success) {
      result.repaired_count++;
      result.product_ids.push(productId);
    } else {
      result.errors.push(rebuildResult.error || `Failed for ${productId}`);
    }
  }

  if (result.errors.length > 0) {
    result.success = result.repaired_count > 0; // partial success
  }

  logger.info(`[rebuild-bulk] complete — repaired=${result.repaired_count} errors=${result.errors.length}`);
  return result;
}
