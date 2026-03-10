import { Router, Request, Response } from 'express';
import { ProductRepo } from '../../database/repositories';
import { validateExportReadiness } from '../../services/export-validation.service';
import { buildSallaPayload } from '../../services/export-payload-builder.service';
import { pushToSalla } from '../../services/export-push.service';
import { CommercePackage, ListingPack } from '../../discovery/types';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /export/salla/:productId
 *
 * Returns a Salla-ready payload preview for an approved product.
 * Does NOT push to Salla — preview only.
 */
router.get('/salla/:productId', async (req: Request, res: Response) => {
  const { productId } = req.params;

  try {
    logger.info(`[export] Salla export preview requested for product ${productId}`);

    // 1. Fetch product
    const product = await ProductRepo.findById(productId);
    if (!product) {
      logger.warn(`[export] Product ${productId} not found`);
      res.status(404).json({
        product_id: productId,
        export_ready: false,
        validation_errors: ['Product not found'],
      });
      return;
    }

    // 2. Extract commerce and listing_pack from metadata
    const metadata = (typeof product.metadata === 'string'
      ? JSON.parse(product.metadata)
      : product.metadata) || {};

    const commerce: CommercePackage | null = metadata.commerce || null;
    const listingPack: ListingPack | null = metadata.listing_pack || null;

    // 3. Validate export readiness
    const validation = validateExportReadiness(product, commerce, listingPack);

    if (!validation.valid) {
      logger.warn(`[export] Product ${productId} not export ready`, {
        errors: validation.errors,
      });
      res.status(400).json({
        product_id: productId,
        approval_status: product.status,
        export_ready: false,
        validation_errors: validation.errors,
      });
      return;
    }

    // 4. Build payload (validation guarantees commerce & listingPack exist)
    const sallaPayload = buildSallaPayload(commerce!, listingPack!);

    logger.info(`[export] Salla payload preview built for product ${productId}`, {
      sku: sallaPayload.sku,
      sale_price: sallaPayload.sale_price,
    });

    res.json({
      product_id: productId,
      approval_status: product.status,
      export_ready: true,
      validation_errors: [],
      salla_payload: sallaPayload,
    });
  } catch (error: any) {
    logger.error(`[export] GET /export/salla/${productId} error: ${error?.message || error}`);
    res.status(500).json({ error: 'Failed to build Salla export preview' });
  }
});

/**
 * POST /export/salla/:productId/push
 *
 * Pushes an approved, export-ready product to Salla.
 * Returns structured result with sync status.
 */
router.post('/salla/:productId/push', async (req: Request, res: Response) => {
  const { productId } = req.params;

  try {
    const result = await pushToSalla(productId);

    if (result.sync_status === 'not_configured') {
      res.status(422).json(result);
      return;
    }

    if (!result.success && result.error === 'Product not found') {
      res.status(404).json(result);
      return;
    }

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error: any) {
    logger.error(`[export] POST /export/salla/${productId}/push error: ${error?.message || error}`);
    res.status(500).json({
      success: false,
      product_id: productId,
      sync_status: 'failed',
      error: 'Internal server error during Salla push',
    });
  }
});

export default router;
