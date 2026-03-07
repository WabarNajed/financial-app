/**
 * Keyword relevance scoring utility.
 * Determines how closely a discovered product relates to the requested keyword.
 */

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

/**
 * Category synonym groups — maps common search terms to product categories.
 * Used for semantic matching when exact tokens don't overlap.
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  kitchen: ['kitchen', 'blender', 'cooking', 'food', 'mixer'],
  home: ['home', 'projector', 'led', 'speaker', 'light', 'lamp', 'quran', 'smart'],
  beauty: ['beauty', 'face', 'skin', 'roller', 'cosmetic', 'tool'],
  car: ['car', 'auto', 'vehicle', 'accessory', 'vacuum'],
  fitness: ['fitness', 'gym', 'health', 'massage', 'recovery', 'muscle', 'exercise'],
  tech: ['tech', 'printer', 'thermal', 'electronic', 'device'],
};

/**
 * Check if keyword tokens and product tokens share a semantic category.
 */
function hasSemanticOverlap(kwTokens: string[], productTokens: string[]): boolean {
  for (const group of Object.values(CATEGORY_SYNONYMS)) {
    const kwHit = kwTokens.some((t) => group.includes(t));
    const prodHit = productTokens.some((t) => group.includes(t));
    if (kwHit && prodHit) return true;
  }
  return false;
}

/**
 * Score relevance between a keyword and a product (0–100).
 * Scores ONLY against intrinsic product properties (name + category),
 * NOT against the product's tagged keywords (which are self-referential
 * since they come from the discovery keyword itself).
 */
export function scoreKeywordRelevance(
  requestedKeyword: string,
  productName: string,
  category: string,
  _productKeywords: string[],
): number {
  const kwNorm = normalize(requestedKeyword);
  const kwTokens = tokenize(requestedKeyword);

  const nameNorm = normalize(productName);
  const catNorm = normalize(category);
  // Only use intrinsic product text (name + category), NOT productKeywords
  const intrinsicText = normalize(`${productName} ${category}`);

  // Exact substring match in name → high relevance
  if (nameNorm.includes(kwNorm)) return 95;

  // Exact substring match in name + category text
  if (intrinsicText.includes(kwNorm)) return 80;

  // Token-level matching against name + category only
  const nameTokens = tokenize(productName);
  const catTokens = tokenize(category);
  const allTokens = [...nameTokens, ...catTokens];

  let matchedTokens = 0;
  for (const kwToken of kwTokens) {
    if (allTokens.some((t) => t.includes(kwToken) || kwToken.includes(t))) {
      matchedTokens++;
    }
  }

  const tokenRatio = kwTokens.length > 0 ? matchedTokens / kwTokens.length : 0;

  // All keyword tokens found in product name/category → good match
  if (tokenRatio >= 1) return 85;
  // Majority of tokens match
  if (tokenRatio >= 0.5) return 60 + Math.round(tokenRatio * 20);

  // Semantic category match (e.g., "gym recovery" ↔ "Fitness & Health")
  if (hasSemanticOverlap(kwTokens, allTokens)) return 65;

  // Category-level substring match (weaker)
  if (catNorm.includes(kwNorm) || kwNorm.includes(catNorm)) return 55;

  // Single-token partial overlap (weak signal)
  if (tokenRatio > 0) return 35 + Math.round(tokenRatio * 30);

  return 15;
}

/**
 * Filter products by keyword relevance threshold.
 * Returns products that meet the minimum relevance for ANY of the requested keywords.
 * Each product is tagged with its best-matching keyword.
 */
export function filterByRelevance<
  T extends { name: string; category: string; keywords: string[] },
>(
  products: T[],
  requestedKeywords: string[],
  minRelevance: number = 55,
): (T & { relevance_score: number; matched_keyword: string })[] {
  return products
    .map((p) => {
      let bestRelevance = 0;
      let bestKeyword = '';
      for (const kw of requestedKeywords) {
        const score = scoreKeywordRelevance(kw, p.name, p.category, p.keywords);
        if (score > bestRelevance) {
          bestRelevance = score;
          bestKeyword = kw;
        }
      }
      return { ...p, relevance_score: bestRelevance, matched_keyword: bestKeyword };
    })
    .filter((p) => p.relevance_score >= minRelevance);
}
