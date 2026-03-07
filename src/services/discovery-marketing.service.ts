import { MarketingRepo } from '../database/repositories';
import { DiscoveredProduct as DiscoveryProduct, CommercePackage, TikTokAdScript } from '../discovery/types';
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

// ---------------------------------------------------------------------------
// Commerce Package Generation
// ---------------------------------------------------------------------------

const USD_TO_SAR = 3.75;
const SHIPPING_SAR = 15;
const MARGIN_MULTIPLIER = 2.2; // targets ~60-120% margin

function computePricing(priceUsd: number | null | undefined) {
  const costSar = (priceUsd ?? 10) * USD_TO_SAR + SHIPPING_SAR;
  const recommendedPriceSar = Math.round(costSar * MARGIN_MULTIPLIER);
  const estimatedProfitSar = recommendedPriceSar - Math.round(costSar);
  return {
    estimated_cost_sar: Math.round(costSar),
    recommended_price_sar: recommendedPriceSar,
    estimated_profit_sar: estimatedProfitSar,
  };
}

function getPotentialLabel(score: number): string {
  if (score >= 80) return 'High Potential';
  if (score >= 70) return 'Good Test Product';
  if (score >= 60) return 'Medium Potential';
  return 'Low Priority';
}

// ---- Product-aware Arabic content maps ----

interface ProductTemplate {
  titleTemplate: (name: string) => string;
  description: (name: string) => string;
  features: string[];
  adScript: TikTokAdScript;
}

const CATEGORY_TEMPLATES: Record<string, ProductTemplate> = {
  kitchen: {
    titleTemplate: (n) => `${n} – مثالي للمطبخ والسفر`,
    description: (n) => `${n} هو الحل العملي لتحضير مشروباتك المفضلة في أي مكان. تصميم صغير وخفيف يناسب حياتك اليومية. مثالي للرياضة والسفر والمنزل.`,
    features: ['سهل الحمل', 'يعمل عبر USB', 'مناسب للمنزل والسفر', 'تصميم أنيق وعملي'],
    adScript: {
      hook: 'هل تعبت من حمل الأجهزة الكبيرة؟',
      problem: 'في السفر أو النادي ما عندك وسيلة سريعة لتحضير مشروبك.',
      demo: 'بهذا الجهاز المحمول تقدر تحضر أي شيء في ثوانٍ!',
      cta: 'اطلبه الآن قبل نفاد الكمية 🔥',
    },
  },
  fitness: {
    titleTemplate: (n) => `${n} – لراحة العضلات بعد التمرين`,
    description: (n) => `${n} يساعدك على الاسترخاء وتخفيف آلام العضلات بعد التمارين الرياضية. مناسب للرياضيين والمحترفين. سهل الاستخدام في المنزل أو النادي.`,
    features: ['عدة مستويات للقوة', 'هادئ الصوت', 'بطارية تدوم طويلاً', 'خفيف وسهل الحمل'],
    adScript: {
      hook: 'عضلاتك متعبة بعد التمرين؟',
      problem: 'ألم العضلات يمنعك من الاستمرار في التمارين.',
      demo: 'بهذا الجهاز تحصل على تدليك احترافي في بيتك!',
      cta: 'اطلبه الآن واستمتع براحة فورية 💪',
    },
  },
  beauty: {
    titleTemplate: (n) => `${n} – العناية بالبشرة بسهولة`,
    description: (n) => `${n} أداة مثالية للعناية بالبشرة. يساعد على تهدئة البشرة وتقليل الانتفاخ وشد المسام. مناسب للاستخدام اليومي في المنزل.`,
    features: ['يهدئ البشرة فوراً', 'يقلل الانتفاخ', 'سهل الاستخدام', 'مناسب لجميع أنواع البشرة'],
    adScript: {
      hook: 'بشرتك تحتاج عناية خاصة؟',
      problem: 'الانتفاخ والإرهاق يظهرون على وجهك.',
      demo: 'بهذه الأداة البسيطة تحصلين على بشرة نضرة في دقائق!',
      cta: 'اطلبيه الآن وجربي الفرق ✨',
    },
  },
  automotive: {
    titleTemplate: (n) => `${n} – إكسسوار ذكي لسيارتك`,
    description: (n) => `${n} يضيف لمسة عملية لسيارتك. تصميم أنيق وتركيب سهل. مناسب لجميع أنواع السيارات ويجعل قيادتك أكثر راحة.`,
    features: ['تركيب سهل وسريع', 'متوافق مع جميع السيارات', 'تصميم أنيق', 'متين وعملي'],
    adScript: {
      hook: 'سيارتك تحتاج هذا الإكسسوار!',
      problem: 'استخدام الجوال أثناء القيادة خطير ومزعج.',
      demo: 'بهذا المنتج تقدر تستخدم جوالك بأمان وسهولة!',
      cta: 'اطلبه الآن واجعل قيادتك أفضل 🚗',
    },
  },
  'smart home': {
    titleTemplate: (n) => `${n} – أجواء مميزة لبيتك`,
    description: (n) => `${n} يحول غرفتك إلى تجربة بصرية مذهلة. سهل التشغيل ومناسب لجميع الغرف. هدية مثالية لمحبي الأجواء المميزة.`,
    features: ['إضاءة متعددة الألوان', 'تشغيل سهل', 'مناسب لجميع الغرف', 'هدية مثالية'],
    adScript: {
      hook: 'غرفتك تحتاج أجواء جديدة؟',
      problem: 'الإضاءة العادية مملة وما تعطي الجو المطلوب.',
      demo: 'بهذا الجهاز تحول غرفتك إلى تجربة سينمائية!',
      cta: 'اطلبه الآن وغير جو بيتك 🌟',
    },
  },
};

const DEFAULT_TEMPLATE: ProductTemplate = {
  titleTemplate: (n) => `${n} – منتج مميز وعملي`,
  description: (n) => `${n} منتج عملي ومميز يناسب احتياجاتك اليومية. جودة عالية بسعر مناسب. مثالي كهدية أو للاستخدام الشخصي.`,
  features: ['جودة عالية', 'سعر مناسب', 'شحن سريع', 'تصميم عملي'],
  adScript: {
    hook: 'شفت هذا المنتج؟',
    problem: 'كثير ناس يدورون على منتج عملي بسعر معقول.',
    demo: 'هذا المنتج يجمع بين الجودة والسعر المناسب!',
    cta: 'اطلبه الآن والكمية محدودة 🔥',
  },
};

function matchCategory(category: string): ProductTemplate {
  const cat = category.toLowerCase();
  for (const [key, tpl] of Object.entries(CATEGORY_TEMPLATES)) {
    if (cat.includes(key)) return tpl;
  }
  return DEFAULT_TEMPLATE;
}

function generateFallbackCommerce(product: DiscoveryProduct): CommercePackage {
  const pricing = computePricing(product.price);
  const tpl = matchCategory(product.category);

  return {
    arabic_title: tpl.titleTemplate(product.name),
    ...pricing,
    description_ar: tpl.description(product.name),
    features: tpl.features,
    tiktok_ad_script: tpl.adScript,
    potential_label: getPotentialLabel(product.final_score),
  };
}

async function generateOpenAICommerce(product: DiscoveryProduct): Promise<CommercePackage | null> {
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const pricing = computePricing(product.price);

    const prompt = `You are a Saudi e-commerce expert specializing in dropshipping.
Generate a commerce package for this product:
Name: ${product.name}
Category: ${product.category}
Price (USD): ${product.price ?? 'unknown'}
Score: ${product.final_score}/100

Pricing (pre-calculated):
  estimated_cost_sar: ${pricing.estimated_cost_sar}
  recommended_price_sar: ${pricing.recommended_price_sar}
  estimated_profit_sar: ${pricing.estimated_profit_sar}

Return ONLY valid JSON:
{
  "arabic_title": "Arabic store-ready title (6-10 words, optimized for ecommerce)",
  "description_ar": "Arabic store description (3-4 sentences, simple, persuasive, clear)",
  "features": ["4 bullet points in Arabic"],
  "tiktok_ad_script": {
    "hook": "Arabic hook line",
    "problem": "Arabic problem statement",
    "demo": "Arabic demo/solution",
    "cta": "Arabic call to action"
  }
}`;

    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 700,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      arabic_title: parsed.arabic_title || '',
      ...pricing,
      description_ar: parsed.description_ar || '',
      features: Array.isArray(parsed.features) ? parsed.features.slice(0, 4) : [],
      tiktok_ad_script: {
        hook: parsed.tiktok_ad_script?.hook || '',
        problem: parsed.tiktok_ad_script?.problem || '',
        demo: parsed.tiktok_ad_script?.demo || '',
        cta: parsed.tiktok_ad_script?.cta || '',
      },
      potential_label: getPotentialLabel(product.final_score),
    };
  } catch (err) {
    logger.warn(`OpenAI commerce generation failed for "${product.name}": ${err}`);
    return null;
  }
}

/**
 * Generate a commerce package for a single product.
 * Uses OpenAI if available, otherwise deterministic fallback.
 */
async function generateCommercePackage(product: DiscoveryProduct): Promise<CommercePackage> {
  if (env.OPENAI_API_KEY) {
    const aiResult = await generateOpenAICommerce(product);
    if (aiResult) return aiResult;
    logger.info(`Falling back to deterministic commerce for "${product.name}"`);
  }
  return generateFallbackCommerce(product);
}

/**
 * Attach commerce packages to an array of discovered products.
 * Mutates each product by setting product.commerce.
 * Returns the count of products enriched.
 */
export async function enrichWithCommerce(products: DiscoveryProduct[]): Promise<number> {
  let enriched = 0;
  for (const product of products) {
    try {
      product.commerce = await generateCommercePackage(product);
      enriched++;
    } catch (err) {
      logger.warn(`Commerce generation failed for "${product.name}": ${err}`);
    }
  }
  logger.info(`Commerce enrichment: ${enriched}/${products.length} products enriched`);
  return enriched;
}
