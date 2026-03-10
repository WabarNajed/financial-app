import { DiscoveredProduct } from './types';
import {
  dedupeProducts,
  estimateCompetition,
  estimateImpulseBuy,
  estimateMargin,
  estimateSaudiRelevance,
  makeId,
  scoreFinal,
} from './utils';
import logger from '../utils/logger';

const RAPID_HOST = process.env.RAPIDAPI_HOST || 'alibaba-datahub.p.rapidapi.com';
const RAPID_KEY = process.env.RAPIDAPI_KEY || '';

/**
 * Extract image URLs from a RapidAPI item, checking all known field locations.
 * Returns { image_url, image_urls } with at least the primary image.
 */
function extractItemImages(item: any): { image_url: string | null; image_urls: string[] } {
  const candidates: string[] = [];

  // All known field names from Alibaba DataHub / AliExpress RapidAPI responses
  const singleFields = [
    item.product_main_image_url,
    item.main_image,
    item.image,
    item.imageUrl,
    item.productImage,
    item.img,
    item.thumb,
    item.thumbnail,
  ];

  for (const val of singleFields) {
    if (typeof val === 'string' && val.trim()) candidates.push(val.trim());
  }

  // Array fields: images[], gallery[], imageList[], productImages[]
  const arrayFields = [
    item.images,
    item.gallery,
    item.imageList,
    item.productImages,
    item.image_urls,
  ];

  for (const arr of arrayFields) {
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
        // Some APIs return { url: string } objects
        if (v && typeof v === 'object' && typeof v.url === 'string' && v.url.trim()) {
          candidates.push(v.url.trim());
        }
      }
    }
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of candidates) {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  }

  return {
    image_url: deduped[0] || null,
    image_urls: deduped,
  };
}

// Log discovery mode once at module load
if (RAPID_KEY) {
  logger.info('[aliexpress] Discovery mode: RapidAPI live search');
} else {
  logger.info('[aliexpress] Discovery mode: mock fallback pool (set RAPIDAPI_KEY for live data)');
}

async function tryRapidApiSample(keyword: string): Promise<DiscoveredProduct[]> {
  if (!RAPID_KEY) return [];

  try {
    const url = `https://${RAPID_HOST}/item_search?q=${encodeURIComponent(keyword)}`;

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPID_KEY,
        'X-RapidAPI-Host': RAPID_HOST,
      },
    });

    if (!response.ok) return [];

    const json: any = await response.json();
    const items = Array.isArray(json?.data) ? json.data.slice(0, 5) : [];

    return items.map((item: any) => {
      const name = item.title || item.name || keyword;
      const category = item.categoryName || 'General';
      const price = Number(item.price || item.salePrice || 0) || 0;
      const reviewCount = Number(item.orders || item.reviewCount || 0) || 0;
      const rating = Number(item.rating || 0) || null;

      const trend = reviewCount > 1000 ? 86 : reviewCount > 300 ? 75 : 62;
      const virality = reviewCount > 1000 ? 72 : 58;
      const saudi = estimateSaudiRelevance(name, category, [keyword]);
      const impulse = estimateImpulseBuy(price, virality);
      const margin = estimateMargin(price);
      const supplierTrust = rating ? Number((rating / 5) * 100) : 55;
      const shipping = 60;
      const competition = estimateCompetition('aliexpress', reviewCount);
      const finalScore = scoreFinal({
        trend_score: trend,
        virality_score: virality,
        margin_score: margin,
        shipping_score: shipping,
        supplier_trust_score: supplierTrust,
        competition_score: competition,
        saudi_relevance_score: saudi,
        impulse_buy_score: impulse,
      });

      // Extract images from all known RapidAPI response fields
      const { image_url, image_urls } = extractItemImages(item);
      logger.info(`[discovery] images found: ${image_urls.length} for "${name}"`);
      if (image_url) {
        logger.info(`[discovery] primary image: ${image_url}`);
      }

      return {
        id: makeId(`aliexpress-${name}-${keyword}`),
        name,
        name_ar: null,
        category,
        source: 'aliexpress' as const,
        source_url: item.itemUrl || item.url || 'https://www.aliexpress.com',
        price,
        currency: item.currency || 'USD',
        rating,
        review_count: reviewCount,
        image_url,
        image_urls,
        keywords: [keyword],
        trend_signal: 'supplier_live',
        virality_score: virality,
        impulse_buy_score: impulse,
        saudi_relevance_score: saudi,
        supplier_trust_score: supplierTrust,
        shipping_score: shipping,
        margin_score: margin,
        competition_score: competition,
        trend_score: trend,
        final_score: finalScore,
        metadata: {
          platform: 'aliexpress',
          discovery_mode: 'rapidapi',
          primary_image_url: image_url,
        },
      } satisfies DiscoveredProduct;
    });
  } catch {
    return [];
  }
}

export async function discoverFromAliExpress(keywords: string[]): Promise<DiscoveredProduct[]> {
  const fallbackPool = [
    { name: 'Mini Thermal Printer', category: 'Tech', price: 18, trend: 78, virality: 83, supplierTrust: 74 },
    { name: 'Portable Blender', category: 'Kitchen', price: 14, trend: 82, virality: 86, supplierTrust: 79 },
    { name: 'Galaxy Projector', category: 'Home', price: 21, trend: 79, virality: 82, supplierTrust: 76 },
    { name: 'Car Vacuum Cleaner', category: 'Car', price: 17, trend: 72, virality: 65, supplierTrust: 73 },
  ];

  const results: DiscoveredProduct[] = [];

  for (const keyword of keywords) {
    const rapid = await tryRapidApiSample(keyword);
    if (rapid.length) {
      results.push(...rapid);
      continue;
    }

    const kwTokens = keyword.toLowerCase().split(/\s+/).filter(Boolean);

    const filtered = fallbackPool.filter((p) => {
      const haystack = `${p.name} ${p.category}`.toLowerCase();
      // Require at least one keyword token to appear in product name/category
      return kwTokens.some((t) => haystack.includes(t));
    });

    // No blind fallback — if nothing matches, skip this keyword
    const sourceItems = filtered;

    for (const item of sourceItems) {
      const saudi = estimateSaudiRelevance(item.name, item.category, [keyword]);
      const impulse = estimateImpulseBuy(item.price, item.virality);
      const margin = estimateMargin(item.price);
      const shipping = 68;
      const competition = estimateCompetition('aliexpress', 500);
      const finalScore = scoreFinal({
        trend_score: item.trend,
        virality_score: item.virality,
        margin_score: margin,
        shipping_score: shipping,
        supplier_trust_score: item.supplierTrust,
        competition_score: competition,
        saudi_relevance_score: saudi,
        impulse_buy_score: impulse,
      });

      results.push({
        id: makeId(`aliexpress-${item.name}-${keyword}`),
        name: item.name,
        name_ar: null,
        category: item.category,
        source: 'aliexpress',
        source_url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(item.name)}`,
        price: item.price,
        currency: 'USD',
        rating: 4.5,
        review_count: 500,
        image_url: null,
        keywords: [keyword],
        trend_signal: 'supplier_fallback',
        virality_score: item.virality,
        impulse_buy_score: impulse,
        saudi_relevance_score: saudi,
        supplier_trust_score: item.supplierTrust,
        shipping_score: shipping,
        margin_score: margin,
        competition_score: competition,
        trend_score: item.trend,
        final_score: finalScore,
        metadata: {
          platform: 'aliexpress',
          discovery_mode: RAPID_KEY ? 'rapidapi' : 'fallback-mock',
        },
      });
    }
  }

  return dedupeProducts(results);
}
