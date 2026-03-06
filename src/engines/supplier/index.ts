import { SupplierOffer, SupplierAdapter } from '../../types';
import { SupplierOfferRepo, ProductRepo } from '../../database/repositories';
import { AliExpressAdapter, AlibabaAdapter } from '../../adapters';
import logger from '../../utils/logger';

export class SupplierMatchingEngine {
  private adapters: SupplierAdapter[];

  constructor(adapters?: SupplierAdapter[]) {
    this.adapters = adapters || [
      new AliExpressAdapter(),
      new AlibabaAdapter(),
    ];
  }

  async findSuppliers(productId: string, keyword: string): Promise<SupplierOffer[]> {
    const allOffers: SupplierOffer[] = [];

    for (const adapter of this.adapters) {
      try {
        logger.info(`Searching ${adapter.name} for: "${keyword}"`);
        const offers = await adapter.search(keyword);
        const tagged = offers.map(o => ({ ...o, product_id: productId }));
        allOffers.push(...tagged);
        logger.info(`${adapter.name}: found ${offers.length} offers`);
      } catch (error) {
        logger.error(`Supplier search failed on ${adapter.name} for "${keyword}": ${error}`);
      }
    }

    // Sort by price (lowest first)
    allOffers.sort((a, b) => a.unit_price_sar - b.unit_price_sar);

    return allOffers;
  }

  async findAndSaveSuppliers(productId: string, keyword: string): Promise<string[]> {
    const offers = await this.findSuppliers(productId, keyword);

    if (offers.length === 0) {
      logger.warn(`No supplier offers found for product ${productId} ("${keyword}")`);
      return [];
    }

    const ids = await SupplierOfferRepo.createMany(offers);
    logger.info(`Saved ${ids.length} supplier offers for product ${productId}`);
    return ids;
  }

  async enrichProduct(productId: string): Promise<SupplierOffer[]> {
    const product = await ProductRepo.findById(productId);
    if (!product) {
      logger.error(`Product ${productId} not found for supplier enrichment`);
      return [];
    }

    // Use product name and first keyword as search terms
    const searchTerms = [product.name, ...(product.keywords || []).slice(0, 2)];
    const allOffers: SupplierOffer[] = [];

    for (const term of searchTerms) {
      const offers = await this.findSuppliers(productId, term);
      allOffers.push(...offers);
    }

    // Deduplicate by supplier URL
    const unique = this.deduplicateOffers(allOffers);

    if (unique.length > 0) {
      await SupplierOfferRepo.createMany(unique);
      logger.info(`Enriched product ${productId} with ${unique.length} unique supplier offers`);
    }

    return unique;
  }

  private deduplicateOffers(offers: SupplierOffer[]): SupplierOffer[] {
    const seen = new Set<string>();
    return offers.filter(offer => {
      const key = `${offer.supplier_url}|${offer.unit_price_usd}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
