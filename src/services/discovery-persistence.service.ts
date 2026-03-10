import { getDb } from '../database/connection';
import { DiscoveredProduct as DiscoveryProduct } from '../discovery/types';
import logger from '../utils/logger';

export interface PersistenceSummary {
  saved: number;
  updated: number;
  skipped: number;
  scored: number;
  productIds: string[];
  errors: string[];
}

/**
 * Persists discovered products into PostgreSQL.
 * Uses the exact same insert pattern as the working seed script.
 */
export async function persistDiscoveredProducts(
  products: DiscoveryProduct[],
): Promise<PersistenceSummary> {
  const summary: PersistenceSummary = {
    saved: 0,
    updated: 0,
    skipped: 0,
    scored: 0,
    productIds: [],
    errors: [],
  };

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (connErr: any) {
    const msg = `DB connection failed: ${connErr?.message || connErr}`;
    logger.error(`[persist] ${msg}`);
    summary.errors.push(msg);
    summary.skipped = products.length;
    return summary;
  }

  for (const product of products) {
    let productId: string | null = null;

    // --- Step A: Insert or update the product row ---
    try {
      logger.info(`[persist] processing "${product.name}" source=${product.source} final_score=${product.final_score}`);

      // Check if product already exists (case-insensitive name + source)
      let existing: any = null;
      try {
        existing = await db('products')
          .whereRaw('LOWER(name) = ?', [product.name.trim().toLowerCase()])
          .andWhere({ source: product.source })
          .first();
      } catch (findErr: any) {
        logger.warn(`[persist] lookup failed for "${product.name}": ${findErr?.message}`);
        // Continue to insert path
      }

      // Build image_urls array from both image_urls[] and image_url fields
      const imageUrls: string[] = [];
      if (Array.isArray(product.image_urls) && product.image_urls.length > 0) {
        imageUrls.push(...product.image_urls);
      } else if (product.image_url) {
        imageUrls.push(product.image_url);
      }
      const primaryImageUrl = imageUrls[0] || null;

      // Merge primary_image_url into metadata
      const metadata = { ...(product.metadata || {}), primary_image_url: primaryImageUrl };

      if (imageUrls.length > 0) {
        logger.info(`[discovery] images found: ${imageUrls.length} for "${product.name}"`);
        logger.info(`[discovery] primary image: ${primaryImageUrl}`);
      }

      if (existing && existing.id) {
        await db('products').where({ id: existing.id }).update({
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          image_urls: JSON.stringify(imageUrls),
          keywords: JSON.stringify(product.keywords || []),
          metadata: JSON.stringify(metadata),
          updated_at: new Date(),
        });
        productId = existing.id;
        summary.updated++;
        logger.info(`[persist] updated "${product.name}" id=${productId}`);
      } else {
        // Match the seed script's exact insert pattern
        const [row] = await db('products').insert({
          name: product.name,
          name_ar: product.name_ar || null,
          category: product.category,
          source: product.source,
          source_url: product.source_url || '',
          trend_signal: product.trend_signal || 'discovery',
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          image_urls: JSON.stringify(imageUrls),
          keywords: JSON.stringify(product.keywords || []),
          status: 'discovered',
          metadata: JSON.stringify(metadata),
        }).returning('id');
        productId = row.id;
        summary.saved++;
        logger.info(`[persist] created "${product.name}" id=${productId}`);
      }
    } catch (err: any) {
      const msg = `INSERT failed for "${product.name}": ${err?.message || err}`;
      logger.error(`[persist] ${msg}`);
      summary.errors.push(msg);
      summary.skipped++;
    }

    if (!productId) continue;

    summary.productIds.push(productId);

    // --- Step B: Upsert product score ---
    try {
      const scoreData = {
        product_id: productId,
        trend_score: product.trend_score,
        demand_score: Math.round((product.virality_score + product.impulse_buy_score) / 2),
        margin_score: product.margin_score,
        shipping_score: product.shipping_score,
        virality_score: product.virality_score,
        competition_score: product.competition_score,
        supplier_trust_score: product.supplier_trust_score,
        final_score: product.final_score,
        scored_at: new Date(),
      };

      const existingScore = await db('product_scores')
        .where({ product_id: productId })
        .first();

      if (existingScore) {
        await db('product_scores').where({ id: existingScore.id }).update(scoreData);
      } else {
        await db('product_scores').insert(scoreData);
      }
      summary.scored++;
      logger.info(`[persist] scored "${product.name}" final_score=${product.final_score}`);
    } catch (scoreErr: any) {
      const msg = `SCORE failed for "${product.name}": ${scoreErr?.message || scoreErr}`;
      logger.warn(`[persist] ${msg}`);
      summary.errors.push(msg);
    }
  }

  logger.info(
    `Discovery persistence: saved=${summary.saved} updated=${summary.updated} scored=${summary.scored} skipped=${summary.skipped}`,
  );

  return summary;
}
