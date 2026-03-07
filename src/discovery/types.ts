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
}
