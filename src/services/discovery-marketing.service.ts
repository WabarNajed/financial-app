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
const BASE_SHIPPING_SAR = 15;

// Category-based shipping surcharges (heavier/bulkier items cost more)
const CATEGORY_SHIPPING: Record<string, number> = {
  fitness: 25,
  car: 20,
  tech: 18,
  kitchen: 15,
  beauty: 12,
  home: 15,
};

// Category-based markup ranges — [min multiplier, max multiplier]
const CATEGORY_MARKUP: Record<string, [number, number]> = {
  beauty: [2.5, 3.5],     // high perceived value
  fitness: [2.0, 2.8],    // bulky but proven demand
  tech: [2.2, 3.0],       // gadgets justify premium
  kitchen: [2.3, 3.2],    // viral kitchen items sell at premium
  car: [2.0, 2.6],        // price-sensitive buyers
  home: [2.4, 3.3],       // decor/ambiance has high markup
};

const DEFAULT_MARKUP: [number, number] = [2.0, 2.8];

interface SmartPricing {
  estimated_cost_sar: number;
  recommended_price_sar: number;
  estimated_profit_sar: number;
  min_price_sar: number;
  max_price_sar: number;
  competitor_price_sar: number;
  gross_margin_percent: number;
}

function computeSmartPricing(product: DiscoveryProduct): SmartPricing {
  const cat = product.category.toLowerCase();
  const shippingSar = CATEGORY_SHIPPING[cat] ?? BASE_SHIPPING_SAR;
  const costSar = (product.price ?? 10) * USD_TO_SAR + shippingSar;
  const roundedCost = Math.round(costSar);

  const [minMult, maxMult] = CATEGORY_MARKUP[cat] ?? DEFAULT_MARKUP;

  // Score-driven multiplier: high-scoring products justify higher markup
  const scoreNorm = Math.min(product.final_score, 100) / 100;           // 0..1
  const impulseNorm = Math.min(product.impulse_buy_score ?? 50, 100) / 100;
  const competitionNorm = Math.min(product.competition_score ?? 50, 100) / 100;

  // High impulse + high score → top of markup range
  // High competition → pushes price toward lower end
  const scoreFactor = (scoreNorm * 0.4 + impulseNorm * 0.35 + (1 - competitionNorm) * 0.25);
  const multiplier = minMult + (maxMult - minMult) * scoreFactor;

  const rawPrice = costSar * multiplier;
  // Round to nearest 5 SAR for a professional price point
  const recommendedPriceSar = Math.round(rawPrice / 5) * 5;
  const minPriceSar = Math.round(costSar * minMult / 5) * 5;
  const maxPriceSar = Math.round(costSar * maxMult / 5) * 5;

  // Competitor price: slightly above our recommended (simulates market)
  const competitorPriceSar = Math.round(recommendedPriceSar * (1.08 + Math.random() * 0.12) / 5) * 5;

  const profit = recommendedPriceSar - roundedCost;
  const grossMargin = recommendedPriceSar > 0 ? Math.round((profit / recommendedPriceSar) * 100) : 0;

  return {
    estimated_cost_sar: roundedCost,
    recommended_price_sar: recommendedPriceSar,
    estimated_profit_sar: profit,
    min_price_sar: minPriceSar,
    max_price_sar: maxPriceSar,
    competitor_price_sar: competitorPriceSar,
    gross_margin_percent: grossMargin,
  };
}

function getPotentialLabel(score: number): string {
  if (score >= 80) return 'High Potential';
  if (score >= 70) return 'Good Test Product';
  if (score >= 60) return 'Medium Potential';
  return 'Low Priority';
}

// ---------------------------------------------------------------------------
// Product-specific content (keyed by exact product name)
// ---------------------------------------------------------------------------

interface ProductContent {
  arabic_title: string;
  description_ar: string;
  features: string[];
  adScript: TikTokAdScript;
}

const PRODUCT_CONTENT: Record<string, ProductContent> = {
  'Portable Blender': {
    arabic_title: 'خلاط محمول USB – مثالي للرياضة والسفر',
    description_ar: 'خلاط صغير يعمل بالشحن عبر USB، يحضّر لك سموذي طازج في أي مكان خلال ٣٠ ثانية. مثالي للنادي أو المكتب أو أثناء السفر. سعة مناسبة لكوب واحد وتنظيفه سهل جداً.',
    features: [
      'يعمل بشحن USB – لا يحتاج كهرباء',
      'شفرات ستانلس ستيل تخلط الثلج بسهولة',
      'سعة ٣٨٠ مل – مثالية لكوب سموذي',
      'خفيف الوزن ويدخل في شنطة الجيم',
    ],
    adScript: {
      hook: 'هل تعبت من حمل الخلاطات الكبيرة؟',
      problem: 'في النادي أو السفر ما عندك طريقة تحضّر سموذي طازج.',
      demo: 'بهذا الخلاط المحمول تقدر تخلط فواكه وثلج في ٣٠ ثانية وتشرب مباشرة من الكوب!',
      cta: 'اطلبه الآن – التوصيل لباب بيتك خلال ٥ أيام',
    },
  },
  'Galaxy Projector': {
    arabic_title: 'بروجكتر نجوم المجرة – إضاءة ذكية لغرفتك',
    description_ar: 'حوّل سقف غرفتك إلى سماء مليانة نجوم وألوان متحركة. يشتغل بريموت ويتغير لأكثر من ١٥ وضع إضاءة. مثالي لغرف النوم وغرف الأطفال والمناسبات.',
    features: [
      'أكثر من ١٥ وضع إضاءة وألوان',
      'ريموت كنترول مع مؤقت إيقاف تلقائي',
      'صوت هادئ – مناسب لغرف النوم',
      'يغطي مساحة حتى ٢٠ متر مربع',
    ],
    adScript: {
      hook: 'تبي تحوّل غرفتك لشيء ثاني؟',
      problem: 'الإضاءة العادية مملة وما تعطيك الجو اللي تبيه للاسترخاء.',
      demo: 'شغّل بروجكتر المجرة وشوف كيف غرفتك تتحول لسماء نجوم حقيقية بضغطة زر!',
      cta: 'اطلبه الآن – هدية مثالية وسعر خاص لفترة محدودة',
    },
  },
  'Ice Face Roller': {
    arabic_title: 'رولر ثلج للوجه – نضارة فورية وشد البشرة',
    description_ar: 'أداة تجميل بسيطة تعتمد على البرودة لتهدئة البشرة وتقليل الانتفاخ حول العين. ضعيها في الفريزر ٣٠ دقيقة واستخدميها صباحاً للحصول على بشرة مشدودة ونضرة. مناسبة لجميع أنواع البشرة.',
    features: [
      'تقلل الانتفاخ والهالات حول العين',
      'تشد المسام وتنعّم البشرة',
      'مصنوعة من مواد آمنة للبشرة الحساسة',
      'تُستخدم بعد المكياج أو الروتين اليومي',
    ],
    adScript: {
      hook: 'وجهك منتفخ الصبح؟ عندنا الحل بثلاث دقائق!',
      problem: 'الانتفاخ الصباحي والهالات يخلّون بشرتك تبان متعبة.',
      demo: 'مرّري رولر الثلج على وجهك دقيقتين وشوفي الفرق – بشرة مشدودة ونضرة فوراً!',
      cta: 'اطلبيه الآن – أداة لازم تكون عندك في روتينك اليومي',
    },
  },
  'Mini Thermal Printer': {
    arabic_title: 'طابعة حرارية صغيرة – اطبع من جوالك بدون حبر',
    description_ar: 'طابعة لاسلكية صغيرة تتصل بجوالك عن طريق البلوتوث وتطبع ملاحظات وصور وملصقات بدون حبر. مثالية للطلاب والمنظمين ومحبي الكتابة اليدوية. البطارية تدوم لأكثر من ٣ أيام بالاستخدام العادي.',
    features: [
      'طباعة حرارية بدون حبر – توفير مستمر',
      'اتصال بلوتوث مع تطبيق سهل الاستخدام',
      'حجم صغير يناسب الجيب أو الشنطة',
      'بطارية تدوم ٣+ أيام بشحنة واحدة',
    ],
    adScript: {
      hook: 'تبي تطبع من جوالك بدون طابعة كبيرة؟',
      problem: 'الطابعات العادية كبيرة وتحتاج حبر وأسلاك.',
      demo: 'بهذي الطابعة الصغيرة تطبع ملاحظاتك وصورك من جوالك مباشرة – بدون حبر!',
      cta: 'اطلبها الآن – مثالية للدراسة والتنظيم اليومي',
    },
  },
  'Car Vacuum Cleaner': {
    arabic_title: 'مكنسة سيارة لاسلكية – تنظيف سريع بشفط قوي',
    description_ar: 'مكنسة صغيرة لاسلكية بقوة شفط عالية مصممة خصيصاً لتنظيف السيارة. تشفط الغبار والفتات والشعر من المقاعد والأرضية بسهولة. بطارية قابلة للشحن ومرشح قابل للغسل.',
    features: [
      'شفط قوي ٦٠٠٠ باسكال – ينظف الغبار والفتات',
      'لاسلكية بالكامل – بطارية تدوم ٣٠ دقيقة',
      'فلتر قابل للغسل والاستخدام المتكرر',
      'رأس مرن يوصل للأماكن الضيقة بين المقاعد',
    ],
    adScript: {
      hook: 'سيارتك فيها غبار وفتات وما تقدر تنظفها؟',
      problem: 'مغاسل السيارات غالية والمكانس العادية ما توصل للأماكن الضيقة.',
      demo: 'بهذي المكنسة اللاسلكية تنظف سيارتك بالكامل في ٥ دقائق – بين المقاعد وتحت الكراسي!',
      cta: 'اطلبها الآن – نظافة سيارتك بيدك في أي وقت',
    },
  },
  'LED Quran Speaker': {
    arabic_title: 'سبيكر قرآن مضيء – إضاءة هادئة وتلاوة بصوت نقي',
    description_ar: 'سبيكر بتصميم أنيق يجمع بين تلاوة القرآن الكريم بأصوات عدة قرّاء وإضاءة LED هادئة. مناسب لغرفة المعيشة أو المكتب. يعمل بالريموت ويدعم بلوتوث لتشغيل محتوى إضافي.',
    features: [
      'تلاوات كاملة بأصوات أشهر القرّاء',
      'إضاءة LED بألوان متعددة هادئة',
      'ريموت كنترول + بلوتوث',
      'تصميم أنيق يناسب أي ديكور',
    ],
    adScript: {
      hook: 'تبي جو روحاني في بيتك مع إضاءة هادئة؟',
      problem: 'الصوتيات العادية ما تعطيك نفس الأجواء، والسبيكرات العادية تصميمها ما يناسب.',
      demo: 'بهذا السبيكر تسمع القرآن بصوت نقي مع إضاءة هادئة تملأ الغرفة بأجواء مريحة!',
      cta: 'اطلبه الآن – هدية مميزة لأهلك وأحبابك',
    },
  },
  'Massage Gun': {
    arabic_title: 'مسدس تدليك العضلات – استشفاء سريع بعد التمرين',
    description_ar: 'جهاز تدليك احترافي بعدة رؤوس وسرعات يخفف ألم العضلات ويسرّع الاستشفاء بعد التمارين. يستخدمه الرياضيون والمحترفون حول العالم. هادئ الصوت وبطاريته تدوم ٤ ساعات متواصلة.',
    features: [
      '٤ رؤوس تدليك لمختلف مناطق الجسم',
      '٦ سرعات – من الخفيف للعميق',
      'بطارية تدوم ٤ ساعات بشحنة واحدة',
      'هادئ الصوت – أقل من ٤٥ ديسيبل',
    ],
    adScript: {
      hook: 'عضلاتك تعبانة بعد التمرين وما تقدر تتحرك؟',
      problem: 'جلسات المساج غالية والألم يأخر تقدمك في التمارين.',
      demo: 'بمسدس التدليك تحصل على مساج احترافي في بيتك – دقيقتين على كل عضلة وترجع كأنك جديد!',
      cta: 'اطلبه الآن – رفيقك الأساسي بعد كل تمرين',
    },
  },
  'Car Phone Holder': {
    arabic_title: 'حامل جوال للسيارة – تثبيت قوي وزاوية مرنة',
    description_ar: 'حامل جوال بتصميم متين يثبت على فتحة المكيف أو الزجاج الأمامي بقوة. يدعم جميع أحجام الجوالات ويدور ٣٦٠ درجة. مثالي للملاحة وتطبيقات التوصيل والمكالمات الآمنة.',
    features: [
      'يدعم جوالات من ٤ إلى ٧ إنش',
      'تثبيت مزدوج – فتحة المكيف أو الزجاج',
      'ذراع مرن يدور ٣٦٠ درجة',
      'فتح وإغلاق بيد واحدة أثناء القيادة',
    ],
    adScript: {
      hook: 'جوالك يطيح وأنت تسوق؟ الحل هنا!',
      problem: 'حمل الجوال باليد أثناء القيادة خطير ومخالفة مرورية.',
      demo: 'ثبّت جوالك بحامل قوي يدور ٣٦٠ درجة – خريطة واضحة ومكالمات بدون ما تشيل الجوال!',
      cta: 'اطلبه الآن – سلامتك وراحتك أثناء القيادة',
    },
  },
};

// Fallback for unknown products: generate content from product name + category
function buildGenericContent(product: DiscoveryProduct): ProductContent {
  const name = product.name;
  const cat = product.category;
  return {
    arabic_title: `${name} – جودة عالية بسعر منافس للسوق السعودي`,
    description_ar: `${name} من فئة ${cat} – منتج عملي مصمم لتلبية احتياجاتك اليومية. يتميز بجودة تصنيع ممتازة وسعر مناسب مقارنة بالمنتجات المنافسة. مناسب كهدية أو للاستخدام الشخصي.`,
    features: [
      `مصمم خصيصاً لفئة ${cat}`,
      'جودة تصنيع عالية ومتانة',
      'شحن سريع للسعودية',
      'ضمان الاستبدال في حال وجود عيب',
    ],
    adScript: {
      hook: `تدور على ${name} بسعر كويس؟`,
      problem: `المنتجات المشابهة في السوق غالية أو جودتها ما ترضيك.`,
      demo: `هذا المنتج يجمع بين الجودة العالية والسعر المناسب – جرّبه وشوف الفرق!`,
      cta: 'اطلبه الآن – الكمية محدودة والسعر خاص',
    },
  };
}

function getProductContent(product: DiscoveryProduct): ProductContent {
  return PRODUCT_CONTENT[product.name] ?? buildGenericContent(product);
}

function generateFallbackCommerce(product: DiscoveryProduct): CommercePackage {
  const pricing = computeSmartPricing(product);
  const content = getProductContent(product);

  return {
    arabic_title: content.arabic_title,
    ...pricing,
    description_ar: content.description_ar,
    features: content.features,
    tiktok_ad_script: content.adScript,
    potential_label: getPotentialLabel(product.final_score),
  };
}

async function generateOpenAICommerce(product: DiscoveryProduct): Promise<CommercePackage | null> {
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const pricing = computeSmartPricing(product);

    const prompt = `You are a Saudi e-commerce copywriter specializing in dropshipping stores.
Write product-specific Arabic marketing content for:

Product: ${product.name}
Category: ${product.category}
Price (USD): ${product.price ?? 'unknown'}
Score: ${product.final_score}/100

RULES:
- Arabic title must be 6-10 words, ecommerce-optimized, mention the product use case
- Description must be 3-4 sentences: specific to THIS product, mention real benefits, Saudi market tone
- Features must be 4 product-specific bullet points (not generic)
- TikTok script must reference THIS product specifically

Return ONLY valid JSON:
{
  "arabic_title": "عنوان عربي جاهز للمتجر",
  "description_ar": "وصف عربي محدد للمنتج",
  "features": ["ميزة ١", "ميزة ٢", "ميزة ٣", "ميزة ٤"],
  "tiktok_ad_script": {
    "hook": "سؤال يجذب الانتباه عن المنتج",
    "problem": "المشكلة اللي يحلها المنتج",
    "demo": "كيف المنتج يحل المشكلة",
    "cta": "دعوة للشراء"
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
