import { getDb } from '../database/connection';
import { ProductScoreRepo } from '../database/repositories';
import { DiscoveredProduct as DiscoveryProduct } from '../discovery/types';
import logger from '../utils/logger';

export interface PersistenceSummary {
  saved: number;
  updated: number;
  skipped: number;
  scored: number;
  productIds: string[];
}

/**
 * Persists discovered products into PostgreSQL.
 * Creates new rows or updates existing ones; also upserts product_scores.
 *
 * Uses direct Knex queries with explicit ::jsonb casts to avoid
 * implicit text→jsonb casting issues with the pg driver.
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
  };

  const db = getDb();

  for (const product of products) {
    try {
      logger.info(`[persist] processing "${product.name}" source=${product.source} final_score=${product.final_score}`);

      // Check if product already exists (case-insensitive name + source)
      const existing = await db('products')
        .whereRaw('LOWER(name) = ?', [product.name.trim().toLowerCase()])
        .andWhere({ source: product.source })
        .first();

      let productId: string;

      // Pre-serialize JSONB values
      const keywordsStr = JSON.stringify(product.keywords || []);
      const imageUrlsStr = JSON.stringify(product.image_url ? [product.image_url] : []);
      const metadataStr = JSON.stringify(product.metadata || {});

      if (existing && existing.id) {
        // Update existing product with latest scores
        await db('products').where({ id: existing.id }).update({
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          keywords: db.raw('?::jsonb', [keywordsStr]),
          metadata: db.raw('?::jsonb', [metadataStr]),
          updated_at: new Date(),
        });
        productId = existing.id;
        summary.updated++;
        logger.info(`[persist] updated existing product "${product.name}" id=${productId}`);
      } else {
        // Create new product with explicit JSONB casts
        const [row] = await db('products').insert({
          name: product.name,
          name_ar: product.name_ar || null,
          category: product.category,
          source: product.source,
          source_url: product.source_url,
          trend_signal: product.trend_signal || 'discovery',
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          image_urls: db.raw('?::jsonb', [imageUrlsStr]),
          keywords: db.raw('?::jsonb', [keywordsStr]),
          status: 'discovered',
          discovered_at: new Date(),
          metadata: db.raw('?::jsonb', [metadataStr]),
        }).returning('id');
        productId = row.id;
        summary.saved++;
        logger.info(`[persist] created new product "${product.name}" id=${productId}`);
      }

      summary.productIds.push(productId);

      // Upsert product score
      try {
        await ProductScoreRepo.upsert({
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
        });
        summary.scored++;
        logger.info(`[persist] scored product "${product.name}" final_score=${product.final_score}`);
      } catch (scoreErr: any) {
        logger.warn(`[persist] FAILED to upsert score for "${product.name}" id=${productId}: ${scoreErr?.message || scoreErr}`);
      }
    } catch (err: any) {
      logger.error(`[persist] FAILED to persist product "${product.name}": ${err?.message || err}`);
      if (err?.stack) logger.error(`[persist] stack: ${err.stack}`);
      summary.skipped++;
    }
  }

  logger.info(
    `Discovery persistence: saved=${summary.saved} updated=${summary.updated} scored=${summary.scored} skipped=${summary.skipped}`,
  );

  return summary;
}
