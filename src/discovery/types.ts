export type SourceType = 'tiktok' | 'amazon' | 'aliexpress';

export interface DiscoveredProduct {
  id: string;
  name: string;
  name_ar?: string | null;
  category: string;
  source: SourceType;
  source_url: string;
  price?: number | null;
  currency?: string | null;
  rating?: number | null;
  review_count?: number | null;
  image_url?: string | null;
  image_urls?: string[];
  keywords: string[];
  trend_signal?: string | null;
  virality_score: number;
  impulse_buy_score: number;
  saudi_relevance_score: number;
  supplier_trust_score: number;
  shipping_score: number;
  margin_score: number;
  competition_score: number;
  trend_score: number;
  final_score: number;
  metadata?: Record<string, any>;
  commerce?: CommercePackage;
  listing_pack?: ListingPack;
}

export interface TikTokAdScript {
  hook: string;
  problem: string;
  demo: string;
  cta: string;
}

export interface ListingPack {
  store_title_ar: string;
  store_title_en: string;
  short_description_ar: string;
  short_description_en: string;
  full_description_ar: string;
  seo_title_ar: string;
  seo_description_ar: string;
  tags: string[];
  suggested_category: string;
  compare_at_price_sar: number;
  sku_hint: string;
  stock_recommendation: number;
}

export interface CommercePackage {
  arabic_title: string;
  recommended_price_sar: number;
  estimated_cost_sar: number;
  estimated_profit_sar: number;
  min_price_sar: number;
  max_price_sar: number;
  competitor_price_sar: number;
  gross_margin_percent: number;
  description_ar: string;
  features: string[];
  tiktok_ad_script: TikTokAdScript;
  potential_label: string;
}
