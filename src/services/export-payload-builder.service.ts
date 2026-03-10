import { CommercePackage, ListingPack } from '../discovery/types';

export interface SallaExportPayload {
  name: string;
  description: string;
  price: number;
  sale_price: number;
  sku: string;
  quantity: number;
  status: 'sale';
  tags: string[];
  metadata: {
    suggested_category: string;
    recommended_price_sar: number;
    compare_at_price_sar: number;
    gross_margin_percent: number;
  };
}

/**
 * Builds a Salla-ready payload from validated commerce + listing_pack data.
 * Assumes validation has already passed.
 */
export function buildSallaPayload(
  commerce: CommercePackage,
  listingPack: ListingPack,
): SallaExportPayload {
  return {
    name: listingPack.store_title_ar,
    description: listingPack.full_description_ar,
    price: listingPack.compare_at_price_sar || commerce.recommended_price_sar,
    sale_price: commerce.recommended_price_sar,
    sku: listingPack.sku_hint,
    quantity: listingPack.stock_recommendation || 25,
    status: 'sale',
    tags: listingPack.tags || [],
    metadata: {
      suggested_category: listingPack.suggested_category || '',
      recommended_price_sar: commerce.recommended_price_sar,
      compare_at_price_sar: listingPack.compare_at_price_sar || 0,
      gross_margin_percent: commerce.gross_margin_percent || 0,
    },
  };
}
