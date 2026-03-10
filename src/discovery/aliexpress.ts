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
    // Alibaba DataHub nests small images as { string: [...] }
    item.product_small_image_urls?.string,
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

  // Normalize: fix protocol-relative URLs (//ae01.alicdn.com/...)
  const normalized = candidates.map((url) =>
    url.startsWith('//') ? `https:${url}` : url,
  );

  // Deduplicate preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of normalized) {
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

/**
 * Extract items array from the RapidAPI response, handling multiple known structures:
 *   - Alibaba DataHub: json.result.resultList[].item
 *   - Flat array: json.data[]
 *   - Nested array: json.data.items[]
 */
function extractItemsFromResponse(json: any): any[] {
  // Alibaba DataHub format: result.resultList[].item
  if (Array.isArray(json?.result?.resultList)) {
    return json.result.resultList
      .map((entry: any) => entry?.item || entry)
      .filter(Boolean);
  }

  // Flat data array
  if (Array.isArray(json?.data)) {
    return json.data;
  }

  // Nested data.items
  if (Array.isArray(json?.data?.items)) {
    return json.data.items;
  }

  // Fallback: items at root
  if (Array.isArray(json?.items)) {
    return json.items;
  }

  return [];
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
    const items = extractItemsFromResponse(json).slice(0, 5);

    logger.info(`[aliexpress] live response received: ${items.length} items, top-level keys: ${Object.keys(json || {}).join(', ')}`);

    if (items.length === 0) {
      logger.warn(`[aliexpress] live API returned 0 items for "${keyword}" — response shape: ${JSON.stringify(Object.keys(json || {}))}`);
      return [];
    }

    return items.map((item: any) => {
      const name = item.title || item.name || keyword;
      const category = item.categoryName || item.category || 'General';
      // Alibaba DataHub uses promotionPrice / salePrice; other APIs use price
      const price = Number(item.promotionPrice || item.price || item.salePrice || 0) || 0;
      const reviewCount = Number(item.sales || item.orders || item.reviewCount || 0) || 0;
      const rating = Number(item.averageStarRate || item.rating || 0) || null;

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

      // Log image extraction results
      const itemKeys = Object.keys(item || {}).filter(k => /image|img|photo|pic|thumb|gallery/i.test(k));
      logger.info(`[discovery] image fields found in response: [${itemKeys.join(', ')}]`);
      logger.info(`[discovery] images found: ${image_urls.length} for "${name}"`);
      if (image_url) {
        logger.info(`[discovery] primary image: ${image_url}`);
      } else {
        logger.warn(`[discovery] no images extracted for "${name}" — item keys: ${Object.keys(item || {}).join(', ')}`);
      }

      return {
        id: makeId(`aliexpress-${name}-${keyword}`),
        name,
        name_ar: null,
        category,
        source: 'aliexpress' as const,
        source_url: item.itemUrl || item.productUrl || item.url || 'https://www.aliexpress.com',
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
  } catch (err: any) {
    logger.error(`[aliexpress] live API error for "${keyword}": ${err?.message || err}`);
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
      logger.info(`[aliexpress] live discovery: ${rapid.length} products for "${keyword}"`);
      results.push(...rapid);
      continue;
    }

    if (RAPID_KEY) {
      logger.warn(`[aliexpress] live API returned 0 results for "${keyword}", skipping fallback`);
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
