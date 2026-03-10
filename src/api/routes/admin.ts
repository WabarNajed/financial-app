import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import { ProductRepo, ProductScoreRepo } from '../../database/repositories';
import { ApprovalService } from '../../services/approval.service';
import { rebuildExportData } from '../../services/export-rebuild.service';
import { validateExportReadiness } from '../../services/export-validation.service';
import { buildSallaPayload } from '../../services/export-payload-builder.service';
import { getIntegrationStatuses } from '../../config';
import logger from '../../utils/logger';

const router = Router();
const approvalService = new ApprovalService();

// ── List products with filters ──────────────────────────────────────────────
router.get('/products', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      search, status, category, source,
      sort_by = 'updated_at', sort_dir = 'desc',
      limit = '50', offset = '0',
      min_score, max_score,
    } = req.query;

    let query = db('products')
      .leftJoin('product_scores', 'products.id', 'product_scores.product_id')
      .select(
        'products.*',
        'product_scores.final_score',
        'product_scores.trend_score',
        'product_scores.virality_score as score_virality',
        'product_scores.margin_score',
        'product_scores.shipping_score',
        'product_scores.competition_score',
        'product_scores.supplier_trust_score as score_supplier_trust',
      );

    if (search) query = query.where('products.name', 'ilike', `%${search}%`);
    if (status) query = query.where('products.status', String(status));
    if (category) query = query.where('products.category', 'ilike', String(category));
    if (source) query = query.where('products.source', String(source));
    if (min_score) query = query.where('product_scores.final_score', '>=', Number(min_score));
    if (max_score) query = query.where('product_scores.final_score', '<=', Number(max_score));

    const sortColumn = String(sort_by) === 'final_score'
      ? 'product_scores.final_score'
      : `products.${sort_by}`;

    const rows = await query
      .orderBy(sortColumn, String(sort_dir) as 'asc' | 'desc')
      .limit(Number(limit))
      .offset(Number(offset));

    // count
    let countQuery = db('products').count('products.id as count');
    if (search) countQuery = countQuery.where('products.name', 'ilike', `%${search}%`);
    if (status) countQuery = countQuery.where('products.status', String(status));
    if (category) countQuery = countQuery.where('products.category', 'ilike', String(category));
    if (source) countQuery = countQuery.where('products.source', String(source));
    const [{ count }] = await countQuery;

    // Parse metadata for each row to extract commerce info
    const products = rows.map((r: any) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      return {
        ...r,
        metadata: meta,
        has_commerce: !!meta.commerce,
        has_listing_pack: !!meta.listing_pack,
        recommended_price_sar: meta.commerce?.recommended_price_sar || null,
        gross_margin_percent: meta.commerce?.gross_margin_percent || null,
      };
    });

    res.json({ data: products, total: Number(count) });
  } catch (error: any) {
    logger.error(`[admin] GET /products error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── Get distinct filter values ──────────────────────────────────────────────
router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const categories = await db('products').distinct('category').whereNotNull('category');
    const sources = await db('products').distinct('source');
    const statuses = await db('products').distinct('status');
    res.json({
      categories: categories.map((r: any) => r.category).filter(Boolean),
      sources: sources.map((r: any) => r.source).filter(Boolean),
      statuses: statuses.map((r: any) => r.status).filter(Boolean),
    });
  } catch (error: any) {
    logger.error(`[admin] GET /filters error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

// ── Get single product with all data ────────────────────────────────────────
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const product = await db('products').where({ id: req.params.id }).first();
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

    const score = await db('product_scores').where({ product_id: req.params.id }).first();

    const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});

    res.json({
      data: {
        ...product,
        metadata: meta,
        score: score || null,
        commerce: meta.commerce || null,
        listing_pack: meta.listing_pack || null,
      },
    });
  } catch (error: any) {
    logger.error(`[admin] GET /products/:id error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ── Update product ──────────────────────────────────────────────────────────
router.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const product = await db('products').where({ id: req.params.id }).first();
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

    const { core, scores, commerce, listing_pack } = req.body;

    // 1. Update core product columns
    if (core) {
      const allowed: Record<string, any> = {};
      const coreFields = ['name', 'name_ar', 'category', 'source', 'source_url'];
      for (const f of coreFields) {
        if (core[f] !== undefined) allowed[f] = core[f];
      }
      if (core.keywords !== undefined) allowed.keywords = JSON.stringify(core.keywords);
      if (core.image_urls !== undefined) allowed.image_urls = JSON.stringify(core.image_urls);
      if (Object.keys(allowed).length > 0) {
        allowed.updated_at = new Date();
        await db('products').where({ id: req.params.id }).update(allowed);
      }
    }

    // 2. Upsert scores
    if (scores) {
      const scoreFields = [
        'trend_score', 'demand_score', 'margin_score', 'shipping_score',
        'virality_score', 'competition_score', 'supplier_trust_score', 'final_score',
      ];
      const scoreData: Record<string, any> = { product_id: req.params.id, scored_at: new Date() };
      for (const f of scoreFields) {
        if (scores[f] !== undefined) scoreData[f] = Number(scores[f]);
      }

      const existing = await db('product_scores').where({ product_id: req.params.id }).first();
      if (existing) {
        await db('product_scores').where({ id: existing.id }).update(scoreData);
      } else {
        await db('product_scores').insert(scoreData);
      }

      // Also update product-level score columns
      if (scores.virality_score !== undefined) {
        await db('products').where({ id: req.params.id }).update({
          virality_score: Number(scores.virality_score),
          updated_at: new Date(),
        });
      }
      if (scores.impulse_buy_score !== undefined) {
        await db('products').where({ id: req.params.id }).update({
          impulse_buy_score: Number(scores.impulse_buy_score),
          updated_at: new Date(),
        });
      }
      if (scores.saudi_relevance_score !== undefined) {
        await db('products').where({ id: req.params.id }).update({
          saudi_relevance_score: Number(scores.saudi_relevance_score),
          updated_at: new Date(),
        });
      }
    }

    // 3. Merge commerce + listing_pack into metadata
    if (commerce || listing_pack) {
      const freshRow = await db('products').where({ id: req.params.id }).first();
      const existingMeta = typeof freshRow.metadata === 'string'
        ? JSON.parse(freshRow.metadata) : (freshRow.metadata || {});

      if (commerce) existingMeta.commerce = { ...(existingMeta.commerce || {}), ...commerce };
      if (listing_pack) existingMeta.listing_pack = { ...(existingMeta.listing_pack || {}), ...listing_pack };

      await db('products').where({ id: req.params.id }).update({
        metadata: JSON.stringify(existingMeta),
        updated_at: new Date(),
      });
    }

    logger.info(`[admin] product ${req.params.id} updated`);
    res.json({ success: true, product_id: req.params.id });
  } catch (error: any) {
    logger.error(`[admin] PUT /products/:id error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to update product', details: error?.message });
  }
});

// ── Approve ─────────────────────────────────────────────────────────────────
router.post('/products/:id/approve', async (req: Request, res: Response) => {
  try {
    await approvalService.approveProduct(req.params.id, req.body.reviewed_by || 'admin', req.body.notes);
    res.json({ success: true, status: 'approved', product_id: req.params.id });
  } catch (error: any) {
    logger.error(`[admin] approve error: ${error?.message}`);
    res.status(500).json({ error: 'Approval failed' });
  }
});

// ── Reject ──────────────────────────────────────────────────────────────────
router.post('/products/:id/reject', async (req: Request, res: Response) => {
  try {
    await approvalService.rejectProduct(req.params.id, req.body.reviewed_by || 'admin', req.body.notes);
    res.json({ success: true, status: 'rejected', product_id: req.params.id });
  } catch (error: any) {
    logger.error(`[admin] reject error: ${error?.message}`);
    res.status(500).json({ error: 'Rejection failed' });
  }
});

// ── Rebuild export data ─────────────────────────────────────────────────────
router.post('/products/:id/rebuild-export-data', async (req: Request, res: Response) => {
  try {
    const result = await rebuildExportData(req.params.id);
    if (!result.success && result.error?.includes('not found')) {
      res.status(404).json(result); return;
    }
    res.json(result);
  } catch (error: any) {
    logger.error(`[admin] rebuild error: ${error?.message}`);
    res.status(500).json({ success: false, error: 'Rebuild failed' });
  }
});

// ── Export preview ──────────────────────────────────────────────────────────
router.get('/products/:id/export-preview', async (req: Request, res: Response) => {
  try {
    const product = await ProductRepo.findById(req.params.id);
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

    const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata as any) : (product.metadata || {});
    const commerce = meta.commerce || null;
    const listingPack = meta.listing_pack || null;
    const validation = validateExportReadiness(product, commerce, listingPack);

    if (!validation.valid) {
      res.json({
        product_id: req.params.id,
        approval_status: product.status,
        export_ready: false,
        validation_errors: validation.errors,
        salla_payload: null,
      });
      return;
    }

    const payload = buildSallaPayload(commerce!, listingPack!);
    res.json({
      product_id: req.params.id,
      approval_status: product.status,
      export_ready: true,
      validation_errors: [],
      salla_payload: payload,
    });
  } catch (error: any) {
    logger.error(`[admin] export-preview error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to build export preview' });
  }
});

// ── System status (for settings page) ───────────────────────────────────────
router.get('/system-status', async (_req: Request, res: Response) => {
  try {
    const integrations = getIntegrationStatuses();
    const db = getDb();
    const [{ count: productCount }] = await db('products').count('id as count');
    const [{ count: approvedCount }] = await db('products').where({ status: 'approved' }).count('id as count');
    const [{ count: pushedCount }] = await db('products').where({ status: 'pushed_to_salla' }).count('id as count');
    res.json({
      integrations,
      stats: {
        total_products: Number(productCount),
        approved: Number(approvedCount),
        pushed_to_salla: Number(pushedCount),
      },
    });
  } catch (error: any) {
    logger.error(`[admin] system-status error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

export default router;
