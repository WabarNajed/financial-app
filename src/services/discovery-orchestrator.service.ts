import { discoverFromAliExpress } from '../discovery/aliexpress';
import { discoverFromAmazon } from '../discovery/amazon';
import { discoverFromTikTok } from '../discovery/tiktok';
import { DiscoveredProduct } from '../discovery/types';
import { dedupeProducts } from '../discovery/utils';
import { filterByRelevance, scoreKeywordRelevance } from '../utils/keyword-relevance';
import { persistDiscoveredProducts, PersistenceSummary } from './discovery-persistence.service';
import { generateMarketingForProducts, enrichWithCommerce, enrichWithListingPack } from './discovery-marketing.service';
import { getDb } from '../database/connection';
import logger from '../utils/logger';

const MIN_RELEVANCE = Number(process.env.DISCOVERY_MIN_RELEVANCE) || 55;

export interface DiscoverLiveOptions {
  keywords: string[];
  save?: boolean;
  generateMarketing?: boolean;
}

export interface DiscoverLiveResult {
  count: number;
  saved: number;
  skipped: number;
  scored: number;
  marketing_generated: number;
  products: DiscoveredProduct[];
  errors?: string[];
}

export class DiscoveryOrchestratorService {
  /**
   * Original discover method — preserved for backward compatibility.
   */
  async discover(keywords: string[]): Promise<DiscoveredProduct[]> {
    const cleanKeywords = (keywords || [])
      .map((k) => String(k).trim())
      .filter(Boolean);

    const seedKeywords = cleanKeywords.length
      ? cleanKeywords
      : ['portable blender', 'galaxy projector', 'massage gun'];

    const [tiktok, amazon, aliexpress] = await Promise.all([
      discoverFromTikTok(seedKeywords),
      discoverFromAmazon(seedKeywords),
      discoverFromAliExpress(seedKeywords),
    ]);

    return dedupeProducts([...tiktok, ...amazon, ...aliexpress]);
  }

  /**
   * Enhanced discover-live with relevance filtering, DB persistence, and marketing generation.
   */
  async discoverLive(options: DiscoverLiveOptions): Promise<DiscoverLiveResult> {
    const { save = true, generateMarketing = true } = options;

    const cleanKeywords = (options.keywords || [])
      .map((k) => String(k).trim())
      .filter(Boolean);

    const seedKeywords = cleanKeywords.length
      ? cleanKeywords
      : ['portable blender', 'galaxy projector', 'massage gun'];

    logger.info(`discover-live: starting with keywords=[${seedKeywords.join(', ')}]`);

    // Step 1: Discover from all sources
    const [tiktok, amazon, aliexpress] = await Promise.all([
      discoverFromTikTok(seedKeywords),
      discoverFromAmazon(seedKeywords),
      discoverFromAliExpress(seedKeywords),
    ]);

    const raw = [...tiktok, ...amazon, ...aliexpress];
    logger.info(`discover-live: raw products from sources: ${raw.length}`);

    // Step 2: Deduplicate
    const deduped = dedupeProducts(raw);
    logger.info(`discover-live: after dedup: ${deduped.length}`);

    // Step 3: Filter by keyword relevance (with debug logging per product)
    for (const p of deduped) {
      for (const kw of seedKeywords) {
        const score = scoreKeywordRelevance(kw, p.name, p.category, p.keywords);
        logger.info(
          `[relevance] product="${p.name}" keyword="${kw}" relevance=${score} ${score >= MIN_RELEVANCE ? 'ACCEPTED' : 'REJECTED'}`,
        );
      }
    }

    const relevant = filterByRelevance(deduped, seedKeywords, MIN_RELEVANCE);
    logger.info(`discover-live: after relevance filter (>=${MIN_RELEVANCE}): ${relevant.length}`);

    // Strip relevance_score but keep matched_keyword in metadata
    const accepted: DiscoveredProduct[] = relevant.map(({ relevance_score, matched_keyword, ...rest }) => ({
      ...rest,
      metadata: { ...(rest.metadata || {}), matched_keyword },
    }));

    const allErrors: string[] = [];

    const result: DiscoverLiveResult = {
      count: accepted.length,
      saved: 0,
      skipped: 0,
      scored: 0,
      marketing_generated: 0,
      products: accepted,
    };

    // Step 4: Persist to DB
    if (save && accepted.length > 0) {
      try {
        const persistence: PersistenceSummary = await persistDiscoveredProducts(accepted);
        result.saved = persistence.saved + persistence.updated;
        result.skipped = persistence.skipped;
        result.scored = persistence.scored;
        if (persistence.errors.length > 0) {
          allErrors.push(...persistence.errors);
        }

        // Map DB IDs back to in-memory products (needed for marketing + metadata update)
        if (persistence.productIds.length > 0) {
          for (let i = 0; i < persistence.productIds.length; i++) {
            if (persistence.productIds[i] && accepted[i]) {
              accepted[i].id = persistence.productIds[i];
            }
          }
        }

        // Step 5: Generate marketing assets
        if (generateMarketing && persistence.productIds.length > 0) {
          try {
            const productIdMap = new Map<string, string>();
            for (const product of accepted) {
              if (product.id) productIdMap.set(product.name, product.id);
            }

            logger.info(`[marketing] productIdMap entries: ${productIdMap.size}, products with score>=70: ${accepted.filter(p => p.final_score >= 70).length}`);
            const marketing = await generateMarketingForProducts(accepted, productIdMap);
            result.marketing_generated = marketing.generated;
            logger.info(`[marketing] generated=${marketing.generated} skipped=${marketing.skipped}`);
          } catch (marketingErr: any) {
            const msg = `marketing failed: ${marketingErr?.message || marketingErr}`;
            logger.warn(`discover-live: ${msg}`);
            allErrors.push(msg);
          }
        }
      } catch (persistErr: any) {
        const msg = `persistence failed: ${persistErr?.message || persistErr}`;
        logger.error(`discover-live: ${msg}`);
        allErrors.push(msg);
      }
    }

    // Step 6: Enrich with commerce packages
    if (accepted.length > 0) {
      try {
        const commerceCount = await enrichWithCommerce(accepted);
        logger.info(`discover-live: commerce packages generated: ${commerceCount}`);
      } catch (commerceErr: any) {
        const msg = `commerce enrichment failed: ${commerceErr?.message || commerceErr}`;
        logger.warn(`discover-live: ${msg}`);
        allErrors.push(msg);
      }

      // Step 7: Enrich with store listing packs (runs after commerce so pricing is available)
      try {
        const listingCount = enrichWithListingPack(accepted);
        logger.info(`discover-live: listing packs generated: ${listingCount}`);
      } catch (listingErr: any) {
        const msg = `listing pack enrichment failed: ${listingErr?.message || listingErr}`;
        logger.warn(`discover-live: ${msg}`);
        allErrors.push(msg);
      }

      // Step 8: Persist commerce + listing_pack into product metadata (for Salla export)
      if (save) {
        try {
          const db = getDb();
          for (const product of accepted) {
            if (!product.id) continue;
            const existing = (typeof product.metadata === 'object' ? product.metadata : {}) || {};
            const merged = { ...existing, commerce: product.commerce, listing_pack: product.listing_pack };
            await db('products').where({ id: product.id }).update({
              metadata: JSON.stringify(merged),
              updated_at: new Date(),
            });
          }
          logger.info(`discover-live: persisted commerce + listing_pack metadata for ${accepted.filter(p => p.id).length} products`);
        } catch (metaErr: any) {
          const msg = `metadata update failed: ${metaErr?.message || metaErr}`;
          logger.warn(`discover-live: ${msg}`);
          allErrors.push(msg);
        }
      }
    }

    if (allErrors.length > 0) {
      result.errors = allErrors;
    }

    logger.info(
      `discover-live: complete — count=${result.count} saved=${result.saved} scored=${result.scored} marketing=${result.marketing_generated}`,
    );

    return result;
  }
}
