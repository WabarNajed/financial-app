import { MarketingRepo } from '../database/repositories';
import { DiscoveredProduct as DiscoveryProduct } from '../discovery/types';
import { env } from '../config';
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

function getPlatformSuggestion(source: string): string {
  const platformMap: Record<string, string> = {
    tiktok: 'tiktok',
    amazon: 'instagram',
    aliexpress: 'snapchat',
  };
  return platformMap[source] || 'meta';
}

/**
 * Generate marketing content via OpenAI API.
 * Falls back to deterministic content on any failure.
 */
async function generateOpenAIMarketing(product: DiscoveryProduct): Promise<MarketingPayload | null> {
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const prompt = `You are a Saudi e-commerce marketing expert. Generate marketing copy for this product:
Name: ${product.name}
Category: ${product.category}
Source: ${product.source}
Score: ${product.final_score}/100

Return ONLY valid JSON with these fields:
{
  "hook_ar": "Arabic hook (1 sentence, attention-grabbing)",
  "hook_en": "English hook (1 sentence)",
  "description_ar": "Arabic product description (2-3 sentences, Saudi market focus)",
  "description_en": "English product description (2-3 sentences)",
  "cta_ar": "Arabic call to action (1 sentence)",
  "cta_en": "English call to action (1 sentence)"
}`;

    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      hook_ar: parsed.hook_ar || '',
      hook_en: parsed.hook_en || '',
      description_ar: parsed.description_ar || '',
      description_en: parsed.description_en || '',
      cta_ar: parsed.cta_ar || '',
      cta_en: parsed.cta_en || '',
      platform_suggestion: getPlatformSuggestion(product.source),
    };
  } catch (err) {
    logger.warn(`OpenAI marketing generation failed for "${product.name}": ${err}`);
    return null;
  }
}

/**
 * Generate deterministic mock marketing content for a product.
 * Used when OPENAI_API_KEY is not configured or OpenAI call fails.
 */
function generateFallbackMarketing(product: DiscoveryProduct): MarketingPayload {
  const name = product.name;
  const cat = product.category;

  return {
    hook_ar: `اكتشف ${name} - المنتج الأكثر رواجاً في فئة ${cat}!`,
    hook_en: `Discover ${name} - the hottest trending product in ${cat}!`,
    description_ar: `${name} هو المنتج المثالي لمتجرك الإلكتروني. يحقق نسبة تفاعل عالية ومبيعات ممتازة في السوق السعودي.`,
    description_en: `${name} is the perfect product for your online store. High engagement rates and excellent sales potential in the Saudi market.`,
    cta_ar: `اطلب الآن واحصل على أفضل سعر! 🔥`,
    cta_en: `Order now and get the best price! 🔥`,
    platform_suggestion: getPlatformSuggestion(product.source),
  };
}

/**
 * Generate marketing content: uses OpenAI if API key is set, otherwise deterministic fallback.
 */
async function generateMarketing(product: DiscoveryProduct): Promise<MarketingPayload> {
  if (env.OPENAI_API_KEY) {
    const aiResult = await generateOpenAIMarketing(product);
    if (aiResult) return aiResult;
    logger.info(`Falling back to deterministic marketing for "${product.name}"`);
  }
  return generateFallbackMarketing(product);
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
      const marketing = await generateMarketing(product);

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
