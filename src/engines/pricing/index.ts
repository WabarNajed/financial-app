import { PricingResult, PricingConfig, SupplierOffer, MarketPriceSummary } from '../../types';
import { pricingConfig as defaultConfig } from '../../config';
import { PricingRepo, SupplierOfferRepo, MarketPriceRepo } from '../../database/repositories';
import logger from '../../utils/logger';

export class PricingEngine {
  private config: PricingConfig;

  constructor(config?: Partial<PricingConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  calculate(offer: SupplierOffer, marketSummary?: MarketPriceSummary | null): PricingResult {
    const unitCost = offer.unit_price_sar;
    const shippingCost = offer.shipping_estimate_sar || this.config.default_shipping_sar;
    const landedCost = unitCost + shippingCost;

    // VAT on the selling price
    const vatMultiplier = this.config.vat_enabled ? (1 + this.config.vat_rate) : 1;

    // Calculate recommended price based on target margin
    // Selling Price = Total Cost / (1 - target_margin)
    // where Total Cost includes product + shipping + platform fees
    const costBeforeMargin = landedCost;
    const preFeePrice = costBeforeMargin / (1 - this.config.target_margin_pct / 100);
    const platformFees = preFeePrice * (this.config.platform_fee_pct / 100);
    const vatAmount = this.config.vat_enabled ? preFeePrice * this.config.vat_rate : 0;
    const totalCost = landedCost + platformFees + vatAmount;

    // If market data exists, adjust price to be competitive
    let recommendedPrice = preFeePrice;
    if (marketSummary && marketSummary.avg_price_sar > 0) {
      // Price between our calculated price and market average, slightly below market
      const marketPrice = marketSummary.avg_price_sar * 0.95;
      recommendedPrice = Math.max(recommendedPrice, marketPrice);
    }

    // Round to nearest SAR
    recommendedPrice = Math.ceil(recommendedPrice);

    const grossProfit = recommendedPrice - totalCost;
    const grossMargin = recommendedPrice > 0 ? (grossProfit / recommendedPrice) * 100 : 0;
    const breakEvenAdCost = grossProfit;
    const safeAdSpend = breakEvenAdCost * this.config.ad_spend_safety_factor;

    const result: PricingResult = {
      product_id: offer.product_id,
      supplier_offer_id: offer.id || '',
      unit_cost_sar: round(unitCost),
      shipping_cost_sar: round(shippingCost),
      landed_cost_sar: round(landedCost),
      vat_amount_sar: round(vatAmount),
      platform_fees_sar: round(platformFees),
      total_cost_sar: round(totalCost),
      recommended_price_sar: round(recommendedPrice),
      gross_profit_sar: round(grossProfit),
      gross_margin_pct: round(grossMargin),
      break_even_ad_cost_sar: round(breakEvenAdCost),
      safe_ad_spend_ceiling_sar: round(safeAdSpend),
      meets_minimum_margin: grossMargin >= this.config.minimum_margin_pct,
    };

    return result;
  }

  async calculateForProduct(productId: string): Promise<PricingResult[]> {
    const offers = await SupplierOfferRepo.findByProductId(productId);
    if (offers.length === 0) {
      logger.warn(`No supplier offers found for product ${productId}`);
      return [];
    }

    const marketSummary = await MarketPriceRepo.getSummary(productId);
    const results: PricingResult[] = [];

    for (const offer of offers) {
      const result = this.calculate(offer, marketSummary);
      try {
        await PricingRepo.create({ ...result, calculated_at: new Date() } as any);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to save pricing for offer ${offer.id}: ${error}`);
      }
    }

    logger.info(`Calculated ${results.length} pricing results for product ${productId}`);
    return results;
  }

  updateConfig(updates: Partial<PricingConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Pricing config updated', { config: this.config });
  }

  getConfig(): PricingConfig {
    return { ...this.config };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
