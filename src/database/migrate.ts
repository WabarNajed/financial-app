import { getDb, closeDb } from './connection';
import logger from '../utils/logger';

async function migrate() {
  const db = getDb();

  try {
    // Enable UUID extension
    await db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Products table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(500) NOT NULL,
        name_ar VARCHAR(500),
        category VARCHAR(200),
        source VARCHAR(100) NOT NULL,
        source_url TEXT,
        trend_signal VARCHAR(200),
        virality_score DECIMAL(5,2) DEFAULT 0,
        impulse_buy_score DECIMAL(5,2) DEFAULT 0,
        saudi_relevance_score DECIMAL(5,2) DEFAULT 0,
        image_urls JSONB DEFAULT '[]',
        keywords JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'discovered',
        salla_product_id VARCHAR(100),
        discovered_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Supplier offers table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS supplier_offers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        supplier_name VARCHAR(300),
        supplier_platform VARCHAR(50) NOT NULL,
        product_title VARCHAR(500),
        unit_price_usd DECIMAL(10,2),
        unit_price_sar DECIMAL(10,2),
        moq INTEGER DEFAULT 1,
        shipping_estimate_usd DECIMAL(10,2),
        shipping_estimate_sar DECIMAL(10,2),
        lead_time_days INTEGER,
        rating DECIMAL(3,2),
        trust_score DECIMAL(5,2),
        supplier_url TEXT,
        image_url TEXT,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Market prices table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS market_prices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        source VARCHAR(50) NOT NULL,
        price_sar DECIMAL(10,2) NOT NULL,
        product_url TEXT,
        title VARCHAR(500),
        fetched_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Product scores table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS product_scores (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        trend_score DECIMAL(5,2) DEFAULT 0,
        demand_score DECIMAL(5,2) DEFAULT 0,
        margin_score DECIMAL(5,2) DEFAULT 0,
        shipping_score DECIMAL(5,2) DEFAULT 0,
        virality_score DECIMAL(5,2) DEFAULT 0,
        competition_score DECIMAL(5,2) DEFAULT 0,
        supplier_trust_score DECIMAL(5,2) DEFAULT 0,
        final_score DECIMAL(5,2) DEFAULT 0,
        scored_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Generated content table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS generated_content (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        title_ar TEXT,
        description_ar TEXT,
        bullet_benefits_ar JSONB DEFAULT '[]',
        short_sales_copy_ar TEXT,
        seo_meta_title_ar VARCHAR(200),
        seo_meta_description_ar VARCHAR(500),
        ad_hook_ar TEXT,
        tiktok_script_idea_ar TEXT,
        snapchat_ad_angle_ar TEXT,
        instagram_reel_caption_ar TEXT,
        generated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Approvals table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS approvals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'discovered',
        reviewed_by VARCHAR(200),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Pricing results table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS pricing_results (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        supplier_offer_id UUID REFERENCES supplier_offers(id) ON DELETE CASCADE,
        unit_cost_sar DECIMAL(10,2),
        shipping_cost_sar DECIMAL(10,2),
        landed_cost_sar DECIMAL(10,2),
        vat_amount_sar DECIMAL(10,2),
        platform_fees_sar DECIMAL(10,2),
        total_cost_sar DECIMAL(10,2),
        recommended_price_sar DECIMAL(10,2),
        gross_profit_sar DECIMAL(10,2),
        gross_margin_pct DECIMAL(5,2),
        break_even_ad_cost_sar DECIMAL(10,2),
        safe_ad_spend_ceiling_sar DECIMAL(10,2),
        meets_minimum_margin BOOLEAN DEFAULT false,
        calculated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Workflow runs table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workflow_name VARCHAR(200) NOT NULL,
        status VARCHAR(50) DEFAULT 'running',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        products_processed INTEGER DEFAULT 0,
        errors JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Marketing assets table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS marketing_assets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        asset_type VARCHAR(50) NOT NULL,
        content_ar TEXT,
        status VARCHAR(50) DEFAULT 'queued',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes
    await db.raw('CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_supplier_offers_product ON supplier_offers(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_market_prices_product ON market_prices(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_product_scores_product ON product_scores(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_product_scores_final ON product_scores(final_score DESC)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_approvals_product ON approvals(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_marketing_assets_product ON marketing_assets(product_id)');

    logger.info('Database migration completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  } finally {
    await closeDb();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
