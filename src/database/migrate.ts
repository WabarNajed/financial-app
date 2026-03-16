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

    // Ad campaigns table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS ad_campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        creative_id VARCHAR(100),
        platform VARCHAR(50) NOT NULL DEFAULT 'tiktok',
        budget DECIMAL(10,2) DEFAULT 50,
        status VARCHAR(50) DEFAULT 'draft',
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        ctr DECIMAL(8,4) DEFAULT 0,
        cpc DECIMAL(10,2) DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        cpa DECIMAL(10,2) DEFAULT 0,
        roas DECIMAL(10,2) DEFAULT 0,
        revenue DECIMAL(12,2) DEFAULT 0,
        spend DECIMAL(12,2) DEFAULT 0,
        scaling_stage VARCHAR(50) DEFAULT 'testing',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Salla integration config ─────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS integrations_salla (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        store_name VARCHAR(300),
        client_id VARCHAR(500),
        client_secret TEXT,
        access_token TEXT,
        refresh_token TEXT,
        webhook_secret TEXT,
        store_url VARCHAR(500),
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Orders ───────────────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        salla_order_id VARCHAR(200) UNIQUE,
        customer_name VARCHAR(300),
        customer_phone VARCHAR(100),
        customer_email VARCHAR(300),
        customer_address TEXT,
        city VARCHAR(200),
        country VARCHAR(100) DEFAULT 'SA',
        postal_code VARCHAR(50),
        order_total DECIMAL(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'SAR',
        order_status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.raw(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        salla_product_id VARCHAR(200),
        product_title VARCHAR(500),
        quantity INTEGER DEFAULT 1,
        sale_price DECIMAL(10,2) DEFAULT 0,
        supplier_source VARCHAR(100),
        supplier_product_id VARCHAR(200),
        supplier_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Alerts ───────────────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        alert_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) DEFAULT 'warning',
        title VARCHAR(500) NOT NULL,
        message TEXT,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
        is_read BOOLEAN DEFAULT false,
        is_resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Email accounts ───────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS email_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email_address VARCHAR(300) NOT NULL,
        smtp_host VARCHAR(300),
        smtp_port INTEGER DEFAULT 587,
        imap_host VARCHAR(300),
        imap_port INTEGER DEFAULT 993,
        email_password_encrypted TEXT,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Email templates ──────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_name VARCHAR(200) NOT NULL UNIQUE,
        subject VARCHAR(500),
        body_ar TEXT,
        body_en TEXT,
        placeholders JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Communications log ───────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS communications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        direction VARCHAR(20) DEFAULT 'inbound',
        channel VARCHAR(50) DEFAULT 'email',
        from_address VARCHAR(300),
        to_address VARCHAR(300),
        subject VARCHAR(500),
        body TEXT,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'received',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Platform settings ────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        setting_key VARCHAR(200) NOT NULL UNIQUE,
        setting_value TEXT,
        setting_type VARCHAR(50) DEFAULT 'string',
        category VARCHAR(100) DEFAULT 'general',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Supplier mapping ─────────────────────────────────────────────────────
    await db.raw(`
      CREATE TABLE IF NOT EXISTS supplier_mappings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        supplier_source VARCHAR(100) NOT NULL,
        supplier_product_id VARCHAR(300),
        supplier_url TEXT,
        supplier_variant_id VARCHAR(300),
        supplier_last_price DECIMAL(10,2),
        supplier_last_stock_status VARCHAR(50) DEFAULT 'in_stock',
        supplier_last_checked_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes
    await db.raw('CREATE INDEX IF NOT EXISTS idx_ad_campaigns_product ON ad_campaigns(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_supplier_offers_product ON supplier_offers(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_market_prices_product ON market_prices(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_product_scores_product ON product_scores(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_product_scores_final ON product_scores(final_score DESC)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_approvals_product ON approvals(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_marketing_assets_product ON marketing_assets(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_orders_salla ON orders(salla_order_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read) WHERE NOT is_read');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_communications_order ON communications(order_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_supplier_mappings_product ON supplier_mappings(product_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(setting_key)');

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
