import { MarketingRepo } from '../database/repositories';
import { DiscoveredProduct as DiscoveryProduct } from '../discovery/types';
import logger from '../utils/logger';

const MIN_SCORE = Number(process.env.DISCOVERY_MARKETING_MIN_SCORE) || 70;

interface MarketingResult {
  generated: number;
  skipped: number;
}

interface MarketingPayload {
  hook_ar: string;
  hook_en: string;
  description_ar: string;
  description_en: string;
  cta_ar: string;
  cta_en: string;
  platform_suggestion: string;
}

/**
 * Generate deterministic mock marketing content for a product.
 * Used when OPENAI_API_KEY is not configured.
 */
function generateMockMarketing(product: DiscoveryProduct): MarketingPayload {
  const name = product.name;
  const cat = product.category;

  const platformMap: Record<string, string> = {
    tiktok: 'tiktok',
    amazon: 'instagram',
    aliexpress: 'snapchat',
  };

  const platform = platformMap[product.source] || 'meta';

  return {
    hook_ar: `اكتشف ${name} - المنتج الأكثر رواجاً في فئة ${cat}!`,
    hook_en: `Discover ${name} - the hottest trending product in ${cat}!`,
    description_ar: `${name} هو المنتج المثالي لمتجرك الإلكتروني. يحقق نسبة تفاعل عالية ومبيعات ممتازة في السوق السعودي.`,
    description_en: `${name} is the perfect product for your online store. High engagement rates and excellent sales potential in the Saudi market.`,
    cta_ar: `اطلب الآن واحصل على أفضل سعر! 🔥`,
    cta_en: `Order now and get the best price! 🔥`,
    platform_suggestion: platform,
  };
}

/**
 * Generate marketing assets for high-scoring discovered products.
 * Saves assets to the marketing_assets table via MarketingRepo.
 */
export async function generateMarketingForProducts(
  products: DiscoveryProduct[],
  productIdMap: Map<string, string>,
): Promise<MarketingResult> {
  const result: MarketingResult = { generated: 0, skipped: 0 };

  const eligible = products.filter((p) => p.final_score >= MIN_SCORE);

  if (eligible.length === 0) {
    logger.info('No products eligible for marketing generation (none above threshold)');
    return result;
  }

  for (const product of eligible) {
    const dbProductId = productIdMap.get(product.name);
    if (!dbProductId) {
      result.skipped++;
      continue;
    }

    try {
      const marketing = generateMockMarketing(product);

      const assets = [
        {
          product_id: dbProductId,
          platform: marketing.platform_suggestion as 'meta' | 'tiktok' | 'snapchat' | 'instagram',
          asset_type: 'hook' as const,
          content_ar: marketing.hook_ar,
          status: 'queued' as const,
          created_at: new Date(),
        },
        {
          product_id: dbProductId,
          platform: marketing.platform_suggestion as 'meta' | 'tiktok' | 'snapchat' | 'instagram',
          asset_type: 'ad_copy' as const,
          content_ar: `${marketing.description_ar}\n\n${marketing.cta_ar}`,
          status: 'queued' as const,
          created_at: new Date(),
        },
      ];

      await MarketingRepo.createMany(assets);
      result.generated++;
    } catch (err) {
      logger.warn(`Failed to generate marketing for "${product.name}": ${err}`);
      result.skipped++;
    }
  }

  logger.info(
    `Marketing generation: generated=${result.generated} skipped=${result.skipped}`,
  );

  return result;
}
