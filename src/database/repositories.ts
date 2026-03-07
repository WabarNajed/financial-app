import { Knex } from 'knex';
import { getDb } from './connection';
import {
  DiscoveredProduct,
  SupplierOffer,
  MarketPrice,
  MarketPriceSummary,
  ProductScore,
  GeneratedContent,
  ApprovalRecord,
  PricingResult,
  WorkflowRun,
  MarketingAsset,
  ProductStatus,
} from '../types';

function db(): Knex {
  return getDb();
}

// --- Products ---
export const ProductRepo = {
  async create(product: Omit<DiscoveredProduct, 'id'>): Promise<string> {
    const [row] = await db()('products').insert(product).returning('id');
    return row.id;
  },

  async findById(id: string): Promise<DiscoveredProduct | null> {
    return db()('products').where({ id }).first() || null;
  },

  async findByStatus(status: ProductStatus): Promise<DiscoveredProduct[]> {
    return db()('products').where({ status }).orderBy('discovered_at', 'desc');
  },

  async updateStatus(id: string, status: ProductStatus): Promise<void> {
    await db()('products').where({ id }).update({ status, updated_at: new Date() });
  },

  async update(id: string, data: Partial<DiscoveredProduct>): Promise<void> {
    await db()('products').where({ id }).update({ ...data, updated_at: new Date() });
  },

  async listAll(limit = 100, offset = 0): Promise<DiscoveredProduct[]> {
    return db()('products').orderBy('discovered_at', 'desc').limit(limit).offset(offset);
  },

  async count(): Promise<number> {
    const [{ count }] = await db()('products').count('id as count');
    return Number(count);
  },

  async search(keyword: string): Promise<DiscoveredProduct[]> {
    return db()('products')
      .where('name', 'ilike', `%${keyword}%`)
      .orWhere('category', 'ilike', `%${keyword}%`)
      .limit(50);
  },

  async findByNameAndSource(name: string, source: string): Promise<DiscoveredProduct | null> {
    return db()('products')
      .whereRaw('LOWER(name) = ?', [name.trim().toLowerCase()])
      .andWhere({ source })
      .first() || null;
  },
};

// --- Supplier Offers ---
export const SupplierOfferRepo = {
  async create(offer: Omit<SupplierOffer, 'id'>): Promise<string> {
    const [row] = await db()('supplier_offers').insert(offer).returning('id');
    return row.id;
  },

  async createMany(offers: Omit<SupplierOffer, 'id'>[]): Promise<string[]> {
    if (offers.length === 0) return [];
    const rows = await db()('supplier_offers').insert(offers).returning('id');
    return rows.map((r: { id: string }) => r.id);
  },

  async findByProductId(productId: string): Promise<SupplierOffer[]> {
    return db()('supplier_offers').where({ product_id: productId }).orderBy('unit_price_sar', 'asc');
  },

  async getBestOffer(productId: string): Promise<SupplierOffer | null> {
    return db()('supplier_offers')
      .where({ product_id: productId })
      .orderBy('unit_price_sar', 'asc')
      .first() || null;
  },
};

// --- Market Prices ---
export const MarketPriceRepo = {
  async create(price: Omit<MarketPrice, 'id'>): Promise<string> {
    const [row] = await db()('market_prices').insert(price).returning('id');
    return row.id;
  },

  async createMany(prices: Omit<MarketPrice, 'id'>[]): Promise<void> {
    if (prices.length === 0) return;
    await db()('market_prices').insert(prices);
  },

  async findByProductId(productId: string): Promise<MarketPrice[]> {
    return db()('market_prices').where({ product_id: productId });
  },

  async getSummary(productId: string): Promise<MarketPriceSummary | null> {
    const prices = await this.findByProductId(productId);
    if (prices.length === 0) return null;

    const sarPrices = prices.map(p => Number(p.price_sar));
    const min = Math.min(...sarPrices);
    const max = Math.max(...sarPrices);
    const avg = sarPrices.reduce((a, b) => a + b, 0) / sarPrices.length;
    const confidence = Math.min(prices.length / 5, 1) * 100;

    return {
      product_id: productId,
      min_price_sar: min,
      max_price_sar: max,
      avg_price_sar: Math.round(avg * 100) / 100,
      sources_count: prices.length,
      confidence_score: Math.round(confidence),
    };
  },
};

// --- Product Scores ---
export const ProductScoreRepo = {
  async upsert(score: Omit<ProductScore, 'id'>): Promise<string> {
    const existing = await db()('product_scores').where({ product_id: score.product_id }).first();
    if (existing) {
      await db()('product_scores').where({ id: existing.id }).update(score);
      return existing.id;
    }
    const [row] = await db()('product_scores').insert(score).returning('id');
    return row.id;
  },

  async findByProductId(productId: string): Promise<ProductScore | null> {
    return db()('product_scores').where({ product_id: productId }).first() || null;
  },

  async getTopProducts(limit = 20): Promise<ProductScore[]> {
    return db()('product_scores').orderBy('final_score', 'desc').limit(limit);
  },
};

// --- Generated Content ---
export const ContentRepo = {
  async upsert(content: Omit<GeneratedContent, 'id'>): Promise<string> {
    const existing = await db()('generated_content').where({ product_id: content.product_id }).first();
    if (existing) {
      await db()('generated_content').where({ id: existing.id }).update(content);
      return existing.id;
    }
    const [row] = await db()('generated_content').insert(content).returning('id');
    return row.id;
  },

  async findByProductId(productId: string): Promise<GeneratedContent | null> {
    return db()('generated_content').where({ product_id: productId }).first() || null;
  },
};

// --- Approvals ---
export const ApprovalRepo = {
  async create(approval: Omit<ApprovalRecord, 'id'>): Promise<string> {
    const [row] = await db()('approvals').insert(approval).returning('id');
    return row.id;
  },

  async updateStatus(productId: string, status: ProductStatus, reviewedBy?: string, notes?: string): Promise<void> {
    const existing = await db()('approvals').where({ product_id: productId }).first();
    if (existing) {
      await db()('approvals').where({ id: existing.id }).update({
        status,
        reviewed_by: reviewedBy,
        notes,
        updated_at: new Date(),
      });
    } else {
      await db()('approvals').insert({
        product_id: productId,
        status,
        reviewed_by: reviewedBy,
        notes,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    await ProductRepo.updateStatus(productId, status);
  },

  async findPending(): Promise<ApprovalRecord[]> {
    return db()('approvals').where({ status: 'analyzed' }).orderBy('created_at', 'asc');
  },
};

// --- Pricing Results ---
export const PricingRepo = {
  async create(result: Omit<PricingResult, 'id'> & { calculated_at?: Date }): Promise<string> {
    const [row] = await db()('pricing_results').insert({
      ...result,
      calculated_at: new Date(),
    }).returning('id');
    return row.id;
  },

  async findByProductId(productId: string): Promise<PricingResult[]> {
    return db()('pricing_results').where({ product_id: productId });
  },

  async getBest(productId: string): Promise<PricingResult | null> {
    return db()('pricing_results')
      .where({ product_id: productId, meets_minimum_margin: true })
      .orderBy('gross_margin_pct', 'desc')
      .first() || null;
  },
};

// --- Workflow Runs ---
export const WorkflowRepo = {
  async create(run: Omit<WorkflowRun, 'id'>): Promise<string> {
    const [row] = await db()('workflow_runs').insert(run).returning('id');
    return row.id;
  },

  async complete(id: string, productsProcessed: number, errors: string[]): Promise<void> {
    await db()('workflow_runs').where({ id }).update({
      status: 'completed',
      completed_at: new Date(),
      products_processed: productsProcessed,
      errors: JSON.stringify(errors),
    });
  },

  async fail(id: string, errors: string[]): Promise<void> {
    await db()('workflow_runs').where({ id }).update({
      status: 'failed',
      completed_at: new Date(),
      errors: JSON.stringify(errors),
    });
  },

  async getRecent(limit = 20): Promise<WorkflowRun[]> {
    return db()('workflow_runs').orderBy('started_at', 'desc').limit(limit);
  },
};

// --- Marketing Assets ---
export const MarketingRepo = {
  async create(asset: Omit<MarketingAsset, 'id'>): Promise<string> {
    const [row] = await db()('marketing_assets').insert(asset).returning('id');
    return row.id;
  },

  async createMany(assets: Omit<MarketingAsset, 'id'>[]): Promise<void> {
    if (assets.length === 0) return;
    await db()('marketing_assets').insert(assets);
  },

  async findByProductId(productId: string): Promise<MarketingAsset[]> {
    return db()('marketing_assets').where({ product_id: productId });
  },

  async findQueued(platform?: string): Promise<MarketingAsset[]> {
    const query = db()('marketing_assets').where({ status: 'queued' });
    if (platform) query.andWhere({ platform });
    return query.orderBy('created_at', 'asc');
  },
};
