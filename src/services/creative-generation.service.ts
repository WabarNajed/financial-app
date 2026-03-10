import { getDb } from '../database/connection';
import { env } from '../config';
import logger from '../utils/logger';

export interface AdConcept {
  concept_number: number;
  hook: string;
  script: string;
  scene_plan: string[];
  shot_list: string[];
  caption: string;
  hashtags: string[];
}

export interface CreativeResult {
  product_id: string;
  concepts: AdConcept[];
  generated_at: string;
}

/**
 * Generate 3 TikTok ad concepts for an approved product.
 */
export async function generateAdCreatives(productId: string): Promise<CreativeResult> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) throw new Error('Product not found');

  const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
  const commerce = meta.commerce || {};
  const listingPack = meta.listing_pack || {};

  let concepts: AdConcept[];

  if (env.OPENAI_API_KEY) {
    try {
      concepts = await generateOpenAICreatives(product, commerce, listingPack);
    } catch (err: any) {
      logger.warn(`[creatives] OpenAI failed for ${productId}: ${err?.message}. Using fallback.`);
      concepts = generateFallbackCreatives(product, commerce, listingPack);
    }
  } else {
    concepts = generateFallbackCreatives(product, commerce, listingPack);
  }

  // Store in metadata
  meta.ad_creatives = { concepts, generated_at: new Date().toISOString() };
  await db('products').where({ id: productId }).update({
    metadata: JSON.stringify(meta),
    updated_at: new Date(),
  });

  logger.info(`[creatives] generated ${concepts.length} concepts for ${productId}`);
  return { product_id: productId, concepts, generated_at: meta.ad_creatives.generated_at };
}

async function generateOpenAICreatives(product: any, commerce: any, listingPack: any): Promise<AdConcept[]> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const prompt = `You are a TikTok ad creative director specializing in Saudi dropshipping products.

Product: ${product.name}
Category: ${product.category}
Arabic Title: ${commerce.arabic_title || listingPack.store_title_ar || product.name}
Price: ${commerce.recommended_price_sar || 0} SAR
Features: ${JSON.stringify(commerce.features || [])}

Generate exactly 3 different TikTok ad concepts. Each must have a unique angle.

Return ONLY valid JSON array:
[
  {
    "concept_number": 1,
    "hook": "Arabic opening hook (1 sentence, attention-grabbing)",
    "script": "Full Arabic ad script (3-4 sentences)",
    "scene_plan": ["Scene 1 description", "Scene 2 description", "Scene 3 description"],
    "shot_list": ["Close-up of product", "User demo", "Price reveal", "CTA screen"],
    "caption": "Arabic caption for the video",
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
  }
]`;

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL || 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1500,
  });

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response');

  const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr);
  return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
}

function generateFallbackCreatives(product: any, commerce: any, listingPack: any): AdConcept[] {
  const name = product.name;
  const titleAr = commerce.arabic_title || listingPack?.store_title_ar || name;
  const price = commerce.recommended_price_sar || 99;
  const features = commerce.features || [];

  const angles = [
    { type: 'problem-solution', hookPrefix: 'تعبت من', angle: 'المشكلة والحل' },
    { type: 'unboxing', hookPrefix: 'وصلني', angle: 'فتح الصندوق' },
    { type: 'comparison', hookPrefix: 'الفرق بين', angle: 'المقارنة' },
  ];

  return angles.map((a, i) => ({
    concept_number: i + 1,
    hook: `${a.hookPrefix} ${titleAr}؟ لازم تشوف هذا!`,
    script: `${titleAr} - المنتج اللي الكل يدور عليه! ${features[0] || 'جودة عالية'} و ${features[1] || 'سعر منافس'}. اطلبه الآن بـ ${price} ريال فقط!`,
    scene_plan: [
      `مشهد ١: ${a.angle} - عرض المشكلة أو الحاجة`,
      `مشهد ٢: عرض المنتج ${name} بشكل جذاب`,
      `مشهد ٣: استعراض الميزات والاستخدام`,
      `مشهد ٤: السعر والدعوة للشراء`,
    ],
    shot_list: [
      'لقطة قريبة للمنتج',
      'لقطة الاستخدام العملي',
      'لقطة ردة الفعل',
      'شاشة السعر والرابط',
    ],
    caption: `${titleAr} 🔥 بس ${price} ريال! اطلبه الآن 👇`,
    hashtags: ['#دروبشيبنج', '#تسوق_اونلاين', `#${product.category}`, '#السعودية', '#تيك_توك'],
  }));
}

/**
 * List all creatives for products.
 */
export async function listCreatives(limit = 50): Promise<any[]> {
  const db = getDb();
  const rows = await db('products')
    .select('id', 'name', 'category', 'status', 'metadata')
    .orderBy('updated_at', 'desc')
    .limit(limit);

  return rows
    .map((r: any) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      if (!meta.ad_creatives) return null;
      return {
        product_id: r.id,
        name: r.name,
        category: r.category,
        status: r.status,
        creatives: meta.ad_creatives,
      };
    })
    .filter(Boolean);
}
