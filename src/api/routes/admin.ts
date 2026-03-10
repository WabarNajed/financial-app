import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import { ProductRepo, ProductScoreRepo } from '../../database/repositories';
import { ApprovalService } from '../../services/approval.service';
import { rebuildExportData } from '../../services/export-rebuild.service';
import { validateExportReadiness } from '../../services/export-validation.service';
import { buildSallaPayload } from '../../services/export-payload-builder.service';
import { getIntegrationStatuses } from '../../config';
import { rebuildImageData, rebuildMissingImages } from '../../services/image-pipeline.service';
import { generateAdCreatives, listCreatives } from '../../services/creative-generation.service';
import { runOptimizationCycle, simulateAdPerformance, evaluateCampaign, getScalingStage } from '../../services/ad-optimization.service';
import { TikTokDiscoveryEngine } from '../../services/tiktok-discovery.service';
import { AliExpressDiscoveryEngine } from '../../services/aliexpress-discovery.service';
import { AmazonDiscoveryEngine } from '../../services/amazon-discovery.service';
import { GoogleTrendsDiscoveryEngine } from '../../services/trends-discovery.service';
import logger from '../../utils/logger';

const router = Router();
const approvalService = new ApprovalService();

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

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

    let countQuery = db('products').count('products.id as count');
    if (search) countQuery = countQuery.where('products.name', 'ilike', `%${search}%`);
    if (status) countQuery = countQuery.where('products.status', String(status));
    if (category) countQuery = countQuery.where('products.category', 'ilike', String(category));
    if (source) countQuery = countQuery.where('products.source', String(source));
    const [{ count }] = await countQuery;

    const products = rows.map((r: any) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      const imageUrls = typeof r.image_urls === 'string' ? JSON.parse(r.image_urls) : (r.image_urls || []);
      return {
        ...r,
        metadata: meta,
        image_urls: imageUrls,
        primary_image_url: meta.primary_image_url || (Array.isArray(imageUrls) ? imageUrls[0] : null) || null,
        has_commerce: !!meta.commerce,
        has_listing_pack: !!meta.listing_pack,
        has_creatives: !!meta.ad_creatives,
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
    const imageUrls = typeof product.image_urls === 'string' ? JSON.parse(product.image_urls) : (product.image_urls || []);

    // Fetch ad campaigns for this product
    let campaigns: any[] = [];
    try {
      campaigns = await db('ad_campaigns').where({ product_id: req.params.id }).orderBy('created_at', 'desc');
    } catch { /* table may not exist yet */ }

    res.json({
      data: {
        ...product,
        metadata: meta,
        image_urls: imageUrls,
        primary_image_url: meta.primary_image_url || (Array.isArray(imageUrls) ? imageUrls[0] : null) || null,
        score: score || null,
        commerce: meta.commerce || null,
        listing_pack: meta.listing_pack || null,
        ad_creatives: meta.ad_creatives || null,
        campaigns,
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

      const productUpdate: Record<string, any> = { updated_at: new Date() };
      if (scores.virality_score !== undefined) productUpdate.virality_score = Number(scores.virality_score);
      if (scores.impulse_buy_score !== undefined) productUpdate.impulse_buy_score = Number(scores.impulse_buy_score);
      if (scores.saudi_relevance_score !== undefined) productUpdate.saudi_relevance_score = Number(scores.saudi_relevance_score);
      if (Object.keys(productUpdate).length > 1) {
        await db('products').where({ id: req.params.id }).update(productUpdate);
      }
    }

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

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PIPELINE ENDPOINTS (Section 1)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/products/:id/rebuild-image-data', async (req: Request, res: Response) => {
  try {
    const result = await rebuildImageData(req.params.id);
    if (!result.success) { res.status(404).json(result); return; }
    res.json(result);
  } catch (error: any) {
    logger.error(`[admin] rebuild-image error: ${error?.message}`);
    res.status(500).json({ success: false, error: 'Image rebuild failed' });
  }
});

router.post('/products/rebuild-missing-images', async (_req: Request, res: Response) => {
  try {
    const result = await rebuildMissingImages();
    res.json(result);
  } catch (error: any) {
    logger.error(`[admin] bulk image rebuild error: ${error?.message}`);
    res.status(500).json({ success: false, error: 'Bulk image rebuild failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATIVE ENDPOINTS (Section 6)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/products/:id/generate-creatives', async (req: Request, res: Response) => {
  try {
    const result = await generateAdCreatives(req.params.id);
    res.json(result);
  } catch (error: any) {
    logger.error(`[admin] generate-creatives error: ${error?.message}`);
    res.status(500).json({ error: 'Creative generation failed', details: error?.message });
  }
});

router.get('/creatives', async (_req: Request, res: Response) => {
  try {
    const creatives = await listCreatives();
    res.json({ data: creatives });
  } catch (error: any) {
    logger.error(`[admin] list creatives error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch creatives' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AD CAMPAIGN ENDPOINTS (Sections 7-9)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/campaigns', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const campaigns = await db('ad_campaigns')
      .leftJoin('products', 'ad_campaigns.product_id', 'products.id')
      .select(
        'ad_campaigns.*',
        'products.name as product_name',
        'products.category as product_category',
      )
      .orderBy('ad_campaigns.created_at', 'desc')
      .limit(100);
    res.json({ data: campaigns });
  } catch (error: any) {
    logger.error(`[admin] GET /campaigns error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { product_id, creative_id, platform = 'tiktok', budget = 50 } = req.body;
    if (!product_id) { res.status(400).json({ error: 'product_id required' }); return; }

    const [row] = await db('ad_campaigns').insert({
      product_id,
      creative_id: creative_id || null,
      platform,
      budget,
      status: 'draft',
      scaling_stage: 'testing',
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('*');

    res.json({ success: true, campaign: row });
  } catch (error: any) {
    logger.error(`[admin] POST /campaigns error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.post('/campaigns/:id/launch', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const campaign = await db('ad_campaigns').where({ id: req.params.id }).first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    // Simulate ad performance
    const perf = simulateAdPerformance(campaign.budget || 50);

    await db('ad_campaigns').where({ id: req.params.id }).update({
      status: 'testing',
      ...perf,
      updated_at: new Date(),
    });

    const updated = await db('ad_campaigns').where({ id: req.params.id }).first();
    const decision = evaluateCampaign(updated);
    const stage = getScalingStage(updated);

    res.json({
      success: true,
      campaign: updated,
      performance: perf,
      optimization: decision,
      scaling_stage: stage,
    });
  } catch (error: any) {
    logger.error(`[admin] launch campaign error: ${error?.message}`);
    res.status(500).json({ error: 'Campaign launch failed' });
  }
});

router.post('/campaigns/:id/simulate', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const campaign = await db('ad_campaigns').where({ id: req.params.id }).first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    const perf = simulateAdPerformance(campaign.budget || 50);
    await db('ad_campaigns').where({ id: req.params.id }).update({
      ...perf,
      updated_at: new Date(),
    });

    const updated = await db('ad_campaigns').where({ id: req.params.id }).first();
    const decision = evaluateCampaign(updated);

    res.json({ campaign: updated, performance: perf, optimization: decision });
  } catch (error: any) {
    logger.error(`[admin] simulate error: ${error?.message}`);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

router.post('/campaigns/optimize', async (_req: Request, res: Response) => {
  try {
    const result = await runOptimizationCycle();
    res.json(result);
  } catch (error: any) {
    logger.error(`[admin] optimize error: ${error?.message}`);
    res.status(500).json({ error: 'Optimization cycle failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY ENGINE ENDPOINTS (Section 3)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/discovery/tiktok-trends', async (req: Request, res: Response) => {
  try {
    const keywords = String(req.query.keywords || 'blender,projector').split(',').map(s => s.trim());
    const engine = new TikTokDiscoveryEngine();
    const trends = await engine.discoverTrends(keywords);
    res.json({ data: trends });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.get('/discovery/aliexpress', async (req: Request, res: Response) => {
  try {
    const keyword = String(req.query.keyword || 'portable blender');
    const engine = new AliExpressDiscoveryEngine();
    const products = await engine.searchProducts(keyword);
    res.json({ data: products });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.get('/discovery/amazon', async (req: Request, res: Response) => {
  try {
    const keyword = String(req.query.keyword || 'portable blender');
    const engine = new AmazonDiscoveryEngine();
    const products = await engine.searchBestsellers(keyword);
    res.json({ data: products });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.get('/discovery/google-trends', async (req: Request, res: Response) => {
  try {
    const keywords = String(req.query.keywords || 'blender,beauty').split(',').map(s => s.trim());
    const engine = new GoogleTrendsDiscoveryEngine();
    const trends = await engine.discoverTrends(keywords);
    res.json({ data: trends });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM STATUS (Section 2)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/system-status', async (_req: Request, res: Response) => {
  try {
    const integrations = getIntegrationStatuses();
    const db = getDb();
    const [{ count: productCount }] = await db('products').count('id as count');
    const [{ count: approvedCount }] = await db('products').where({ status: 'approved' }).count('id as count');
    const [{ count: pushedCount }] = await db('products').where({ status: 'pushed_to_salla' }).count('id as count');

    // Image stats
    const allProducts = await db('products').select('id', 'image_urls', 'metadata');
    let withImages = 0;
    let missingImages = 0;
    for (const p of allProducts) {
      const imgs = typeof p.image_urls === 'string' ? JSON.parse(p.image_urls) : (p.image_urls || []);
      if (Array.isArray(imgs) && imgs.length > 0) { withImages++; } else { missingImages++; }
    }
    const imageCoverage = allProducts.length > 0 ? Math.round((withImages / allProducts.length) * 100) : 0;

    // Export readiness count
    let exportReady = 0;
    for (const p of allProducts) {
      const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata || {});
      if (meta.commerce && meta.listing_pack) exportReady++;
    }

    // Campaign stats
    let campaignStats = { total: 0, testing: 0, scaled: 0, killed: 0 };
    try {
      const [{ count: total }] = await db('ad_campaigns').count('id as count');
      const [{ count: testing }] = await db('ad_campaigns').where({ status: 'testing' }).count('id as count');
      const [{ count: scaled }] = await db('ad_campaigns').where({ status: 'scaled' }).count('id as count');
      const [{ count: killed }] = await db('ad_campaigns').where({ status: 'killed' }).count('id as count');
      campaignStats = { total: Number(total), testing: Number(testing), scaled: Number(scaled), killed: Number(killed) };
    } catch { /* table may not exist yet */ }

    res.json({
      integrations,
      stats: {
        total_products: Number(productCount),
        approved: Number(approvedCount),
        pushed_to_salla: Number(pushedCount),
        with_images: withImages,
        missing_images: missingImages,
        image_coverage_pct: imageCoverage,
        export_ready: exportReady,
        campaigns: campaignStats,
      },
    });
  } catch (error: any) {
    logger.error(`[admin] system-status error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

export default router;
