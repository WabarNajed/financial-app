import { ProductScore, ScoringWeights, DiscoveredProduct, SupplierOffer, PricingResult, MarketPriceSummary } from '../../types';
import { scoringWeights as defaultWeights } from '../../config';
import { ProductScoreRepo, ProductRepo, SupplierOfferRepo, PricingRepo, MarketPriceRepo } from '../../database/repositories';
import logger from '../../utils/logger';

export class ProductScoringEngine {
  private weights: ScoringWeights;

  constructor(weights?: Partial<ScoringWeights>) {
    this.weights = { ...defaultWeights, ...weights };
    this.validateWeights();
  }

  async scoreProduct(productId: string): Promise<ProductScore> {
    const product = await ProductRepo.findById(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    const offers = await SupplierOfferRepo.findByProductId(productId);
    const pricing = await PricingRepo.findByProductId(productId);
    const marketSummary = await MarketPriceRepo.getSummary(productId);

    const bestPricing = pricing
      .filter(p => p.meets_minimum_margin)
      .sort((a, b) => b.gross_margin_pct - a.gross_margin_pct)[0];

    const scores = {
      trend: this.calculateTrendScore(product),
      demand: this.calculateDemandScore(product, marketSummary),
      margin: this.calculateMarginScore(bestPricing),
      shipping: this.calculateShippingScore(offers),
      virality: this.calculateViralityScore(product),
      competition: this.calculateCompetitionScore(marketSummary),
      supplier_trust: this.calculateSupplierTrustScore(offers),
    };

    const finalScore = this.calculateFinalScore(scores);

    const productScore: ProductScore = {
      product_id: productId,
      trend_score: round(scores.trend),
      demand_score: round(scores.demand),
      margin_score: round(scores.margin),
      shipping_score: round(scores.shipping),
      virality_score: round(scores.virality),
      competition_score: round(scores.competition),
      supplier_trust_score: round(scores.supplier_trust),
      final_score: round(finalScore),
      scored_at: new Date(),
    };

    await ProductScoreRepo.upsert(productScore);
    logger.info(`Product ${productId} scored: ${(Math.round(Number(finalScore) * 10) / 10)}/100`);

    return productScore;
  }

  private calculateTrendScore(product: DiscoveredProduct): number {
    let score = 50;

    // Boost for specific trend signals
    const signalBoosts: Record<string, number> = {
      'tiktok_viral': 30,
      'bestseller': 25,
      'rising': 20,
      'breakout': 35,
      'keyword_search': 10,
      'listing': 5,
    };

    const boost = signalBoosts[product.trend_signal] || 0;
    score += boost;

    // Saudi relevance boost
    score += (product.saudi_relevance_score - 50) * 0.3;

    return clamp(score, 0, 100);
  }

  private calculateDemandScore(product: DiscoveredProduct, market: MarketPriceSummary | null): number {
    let score = 50;

    // More market data = more demand signal
    if (market) {
      score += Math.min(market.sources_count * 10, 30);
      score += market.confidence_score * 0.2;
    }

    // High impulse buy score suggests demand
    score += (product.impulse_buy_score - 50) * 0.3;

    return clamp(score, 0, 100);
  }

  private calculateMarginScore(pricing: PricingResult | undefined): number {
    if (!pricing) return 30;
    if (!pricing.meets_minimum_margin) return 15;

    // Scale based on margin percentage
    if (pricing.gross_margin_pct >= 50) return 100;
    if (pricing.gross_margin_pct >= 40) return 85;
    if (pricing.gross_margin_pct >= 30) return 70;
    if (pricing.gross_margin_pct >= 20) return 55;
    return 40;
  }

  private calculateShippingScore(offers: SupplierOffer[]): number {
    if (offers.length === 0) return 30;

    const avgLeadTime = offers.reduce((sum, o) => sum + (o.lead_time_days || 20), 0) / offers.length;

    // Faster shipping = higher score
    if (avgLeadTime <= 7) return 100;
    if (avgLeadTime <= 14) return 80;
    if (avgLeadTime <= 21) return 60;
    if (avgLeadTime <= 30) return 40;
    return 20;
  }

  private calculateViralityScore(product: DiscoveredProduct): number {
    return clamp(product.virality_score, 0, 100);
  }

  private calculateCompetitionScore(market: MarketPriceSummary | null): number {
    if (!market) return 70; // No data = potentially low competition

    // Fewer competitors = higher score
    if (market.sources_count <= 1) return 90;
    if (market.sources_count <= 3) return 70;
    if (market.sources_count <= 5) return 50;
    return 30;
  }

  private calculateSupplierTrustScore(offers: SupplierOffer[]): number {
    if (offers.length === 0) return 0;

    const trustScores = offers
      .map(o => o.trust_score)
      .filter((s): s is number => s !== null && s !== undefined);

    if (trustScores.length === 0) return 40;

    return Math.max(...trustScores);
  }

  private calculateFinalScore(scores: Record<string, number>): number {
    return (
      scores.trend * this.weights.trend +
      scores.demand * this.weights.demand +
      scores.margin * this.weights.margin +
      scores.shipping * this.weights.shipping +
      scores.virality * this.weights.virality +
      scores.competition * this.weights.competition +
      scores.supplier_trust * this.weights.supplier_trust
    );
  }

  private validateWeights(): void {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      logger.warn(`Scoring weights sum to ${sum}, not 1.0. Results may be unexpected.`);
    }
  }

  updateWeights(updates: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...updates };
    this.validateWeights();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
