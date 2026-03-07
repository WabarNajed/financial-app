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
 * Score relevance between a keyword and a product (0–100).
 * Considers product name, category, and associated keywords.
 */
export function scoreKeywordRelevance(
  requestedKeyword: string,
  productName: string,
  category: string,
  productKeywords: string[],
): number {
  const kwNorm = normalize(requestedKeyword);
  const kwTokens = tokenize(requestedKeyword);

  const nameNorm = normalize(productName);
  const catNorm = normalize(category);
  const allText = normalize(`${productName} ${category} ${productKeywords.join(' ')}`);

  // Exact substring match in name → high relevance
  if (nameNorm.includes(kwNorm)) return 95;

  // Exact substring match in combined text
  if (allText.includes(kwNorm)) return 80;

  // Token-level matching
  const nameTokens = tokenize(productName);
  const catTokens = tokenize(category);
  const prodKwTokens = productKeywords.flatMap(tokenize);
  const allTokens = [...nameTokens, ...catTokens, ...prodKwTokens];

  let matchedTokens = 0;
  for (const kwToken of kwTokens) {
    if (allTokens.some((t) => t.includes(kwToken) || kwToken.includes(t))) {
      matchedTokens++;
    }
  }

  const tokenRatio = kwTokens.length > 0 ? matchedTokens / kwTokens.length : 0;

  // All keyword tokens found somewhere → good match
  if (tokenRatio >= 1) return 85;
  if (tokenRatio >= 0.5) return 60 + Math.round(tokenRatio * 20);

  // Category-level match (weaker)
  if (catNorm.includes(kwNorm) || kwNorm.includes(catNorm)) return 55;

  // Partial single-token overlap
  if (tokenRatio > 0) return 35 + Math.round(tokenRatio * 30);

  return 15;
}

/**
 * Filter products by keyword relevance threshold.
 * Returns products that meet the minimum relevance for ANY of the requested keywords.
 */
export function filterByRelevance<
  T extends { name: string; category: string; keywords: string[] },
>(
  products: T[],
  requestedKeywords: string[],
  minRelevance: number = 55,
): (T & { relevance_score: number })[] {
  return products
    .map((p) => {
      const bestRelevance = Math.max(
        ...requestedKeywords.map((kw) =>
          scoreKeywordRelevance(kw, p.name, p.category, p.keywords),
        ),
      );
      return { ...p, relevance_score: bestRelevance };
    })
    .filter((p) => p.relevance_score >= minRelevance);
}
