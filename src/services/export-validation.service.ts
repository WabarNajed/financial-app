import { DiscoveredProduct } from '../types';
import { CommercePackage, ListingPack } from '../discovery/types';
import logger from '../utils/logger';

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates whether a product is ready for Salla export.
 * Returns structured errors for each missing requirement.
 */
export function validateExportReadiness(
  product: DiscoveredProduct | null,
  commerce: CommercePackage | null,
  listingPack: ListingPack | null,
): ExportValidationResult {
  const errors: string[] = [];

  if (!product) {
    return { valid: false, errors: ['Product not found'] };
  }

  if (product.status !== 'approved') {
    errors.push(`Product status is "${product.status}", must be "approved"`);
  }

  if (!listingPack) {
    errors.push('listing_pack is missing');
  } else {
    if (!listingPack.store_title_ar) {
      errors.push('listing_pack.store_title_ar is missing');
    }
    if (!listingPack.full_description_ar) {
      errors.push('listing_pack.full_description_ar is missing');
    }
    if (!listingPack.sku_hint) {
      errors.push('listing_pack.sku_hint is missing');
    }
  }

  if (!commerce) {
    errors.push('commerce data is missing');
  } else {
    if (!commerce.recommended_price_sar || commerce.recommended_price_sar <= 0) {
      errors.push('commerce.recommended_price_sar is missing or invalid (must be > 0)');
    }
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn(`[export-validation] Product ${product?.id} not export ready`, { errors });
  }

  return { valid, errors };
}
