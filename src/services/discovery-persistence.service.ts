import { ProductRepo, ProductScoreRepo } from '../database/repositories';
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

  for (const product of products) {
    try {
      logger.info(`[persist] processing "${product.name}" source=${product.source} final_score=${product.final_score}`);

      const existing = await ProductRepo.findByNameAndSource(product.name, product.source);

      let productId: string;

      // JSONB columns must be JSON.stringify'd for the pg driver
      const keywordsJson = JSON.stringify(product.keywords || []);
      const imageUrlsJson = JSON.stringify(product.image_url ? [product.image_url] : []);
      const metadataJson = JSON.stringify(product.metadata || {});

      if (existing && existing.id) {
        // Update existing product with latest scores
        await ProductRepo.update(existing.id, {
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          keywords: keywordsJson as any,
          metadata: metadataJson as any,
        });
        productId = existing.id;
        summary.updated++;
        logger.info(`[persist] updated existing product "${product.name}" id=${productId}`);
      } else {
        // Create new product
        productId = await ProductRepo.create({
          name: product.name,
          name_ar: product.name_ar || undefined,
          category: product.category,
          source: product.source,
          source_url: product.source_url,
          trend_signal: product.trend_signal || 'discovery',
          virality_score: product.virality_score,
          impulse_buy_score: product.impulse_buy_score,
          saudi_relevance_score: product.saudi_relevance_score,
          image_urls: imageUrlsJson as any,
          keywords: keywordsJson as any,
          status: 'discovered',
          discovered_at: new Date(),
          metadata: metadataJson as any,
        });
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
      } catch (scoreErr) {
        logger.warn(`[persist] FAILED to upsert score for product ${productId}: ${scoreErr}`);
      }
    } catch (err) {
      logger.warn(`[persist] FAILED to persist product "${product.name}": ${err}`);
      summary.skipped++;
    }
  }

  logger.info(
    `Discovery persistence: saved=${summary.saved} updated=${summary.updated} scored=${summary.scored} skipped=${summary.skipped}`,
  );

  return summary;
}
