// =============================================================================
// Core Types for Saudi Dropshipping AI Agent
// =============================================================================

export type ProductStatus =
  | 'discovered'
  | 'analyzed'
  | 'approved'
  | 'rejected'
  | 'pushed_to_salla'
  | 'failed';

export interface DiscoveredProduct {
  id?: string;
  name: string;
  name_ar?: string;
  category: string;
  source: string;
  source_url?: string;
  trend_signal: string;
  virality_score: number;
  impulse_buy_score: number;
  saudi_relevance_score: number;
  image_urls: string[];
  keywords: string[];
  status: ProductStatus;
  discovered_at: Date;
  metadata?: Record<string, unknown>;
}

export interface SupplierOffer {
  id?: string;
  product_id: string;
  supplier_name: string;
  supplier_platform: 'alibaba' | 'aliexpress' | 'other';
  product_title: string;
  unit_price_usd: number;
  unit_price_sar: number;
  moq: number;
  shipping_estimate_usd: number;
  shipping_estimate_sar: number;
  lead_time_days: number;
  rating: number | null;
  trust_score: number | null;
  supplier_url: string;
  image_url?: string;
  fetched_at: Date;
  metadata?: Record<string, unknown>;
}

export interface MarketPrice {
  id?: string;
  product_id: string;
  source: 'amazon_sa' | 'noon' | 'salla' | 'manual';
  price_sar: number;
  product_url?: string;
  title?: string;
  fetched_at: Date;
}

export interface MarketPriceSummary {
  product_id: string;
  min_price_sar: number;
  max_price_sar: number;
  avg_price_sar: number;
  sources_count: number;
  confidence_score: number;
}

export interface PricingResult {
  product_id: string;
  supplier_offer_id: string;
  unit_cost_sar: number;
  shipping_cost_sar: number;
  landed_cost_sar: number;
  vat_amount_sar: number;
  platform_fees_sar: number;
  total_cost_sar: number;
  recommended_price_sar: number;
  gross_profit_sar: number;
  gross_margin_pct: number;
  break_even_ad_cost_sar: number;
  safe_ad_spend_ceiling_sar: number;
  meets_minimum_margin: boolean;
}

export interface ProductScore {
  id?: string;
  product_id: string;
  trend_score: number;
  demand_score: number;
  margin_score: number;
  shipping_score: number;
  virality_score: number;
  competition_score: number;
  supplier_trust_score: number;
  final_score: number;
  scored_at: Date;
}

export interface GeneratedContent {
  id?: string;
  product_id: string;
  title_ar: string;
  description_ar: string;
  bullet_benefits_ar: string[];
  short_sales_copy_ar: string;
  seo_meta_title_ar: string;
  seo_meta_description_ar: string;
  ad_hook_ar: string;
  tiktok_script_idea_ar: string;
  snapchat_ad_angle_ar: string;
  instagram_reel_caption_ar: string;
  generated_at: Date;
}

export interface ApprovalRecord {
  id?: string;
  product_id: string;
  status: ProductStatus;
  reviewed_by?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SallaProductPayload {
  name: string;
  description: string;
  price: number;
  compare_price?: number;
  cost_price?: number;
  sku?: string;
  quantity?: number;
  images?: { url: string }[];
  metadata?: Record<string, unknown>;
  status?: 'sale' | 'out' | 'hidden';
}

export interface SallaProductResponse {
  id: number;
  name: string;
  url: string;
  status: string;
}

export interface WorkflowRun {
  id?: string;
  workflow_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: Date;
  completed_at?: Date;
  products_processed: number;
  errors: string[];
  metadata?: Record<string, unknown>;
}

export interface MarketingAsset {
  id?: string;
  product_id: string;
  platform: 'meta' | 'tiktok' | 'snapchat' | 'instagram';
  asset_type: 'ad_copy' | 'script' | 'caption' | 'hook';
  content_ar: string;
  status: 'queued' | 'sent' | 'used';
  created_at: Date;
}

export interface PricingConfig {
  target_margin_pct: number;
  minimum_margin_pct: number;
  vat_rate: number;
  vat_enabled: boolean;
  platform_fee_pct: number;
  default_shipping_sar: number;
  usd_to_sar_rate: number;
  ad_spend_safety_factor: number;
}

export interface ScoringWeights {
  trend: number;
  demand: number;
  margin: number;
  shipping: number;
  virality: number;
  competition: number;
  supplier_trust: number;
}

export interface SourceAdapter {
  name: string;
  enabled: boolean;
  discover(keywords?: string[]): Promise<DiscoveredProduct[]>;
}

export interface SupplierAdapter {
  name: string;
  platform: 'alibaba' | 'aliexpress' | 'other';
  search(keyword: string): Promise<SupplierOffer[]>;
}

export interface MarketAdapter {
  name: string;
  source: 'amazon_sa' | 'noon' | 'salla' | 'manual';
  search(keyword: string): Promise<MarketPrice[]>;
}
