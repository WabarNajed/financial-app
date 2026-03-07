import { discoverFromAliExpress } from '../discovery/aliexpress';
import { discoverFromAmazon } from '../discovery/amazon';
import { discoverFromTikTok } from '../discovery/tiktok';
import { DiscoveredProduct } from '../discovery/types';
import { dedupeProducts } from '../discovery/utils';
import { filterByRelevance, scoreKeywordRelevance } from '../utils/keyword-relevance';
import { persistDiscoveredProducts, PersistenceSummary } from './discovery-persistence.service';
import { generateMarketingForProducts } from './discovery-marketing.service';
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

    // Strip the added relevance_score field for clean output
    const accepted: DiscoveredProduct[] = relevant.map(({ relevance_score, ...rest }) => rest);

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

        // Step 5: Generate marketing assets
        if (generateMarketing && persistence.productIds.length > 0) {
          try {
            // Build name→DB ID map from persistence
            const productIdMap = new Map<string, string>();
            for (const product of accepted) {
              const idx = accepted.indexOf(product);
              if (persistence.productIds[idx]) {
                productIdMap.set(product.name, persistence.productIds[idx]);
              }
            }
            // Also try matching by name for products that were updated (index might differ)
            for (let i = 0; i < persistence.productIds.length; i++) {
              if (persistence.productIds[i] && accepted[i]) {
                productIdMap.set(accepted[i].name, persistence.productIds[i]);
              }
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

    if (allErrors.length > 0) {
      result.errors = allErrors;
    }

    logger.info(
      `discover-live: complete — count=${result.count} saved=${result.saved} scored=${result.scored} marketing=${result.marketing_generated}`,
    );

    return result;
  }
}
