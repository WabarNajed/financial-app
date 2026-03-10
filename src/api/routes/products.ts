import { Router, Request, Response } from 'express';
import { ProductRepo, SupplierOfferRepo, MarketPriceRepo, ProductScoreRepo, PricingRepo, ContentRepo } from '../../database/repositories';
import { OrchestratorService } from '../../services/orchestrator.service';
import { ApprovalService } from '../../services/approval.service';
import { ArabicContentGenerator } from '../../integrations/content';
import { MarketingService } from '../../marketing';
import { rebuildExportData, rebuildMissingExportData } from '../../services/export-rebuild.service';
import logger from '../../utils/logger';

const router = Router();
const orchestrator = new OrchestratorService();
const approvalService = new ApprovalService();
const contentGenerator = new ArabicContentGenerator();
const marketingService = new MarketingService();

// List all products with optional status filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = '100', offset = '0', search } = req.query;

    if (search) {
      const products = await ProductRepo.search(String(search));
      res.json({ data: products, count: products.length });
      return;
    }

    if (status) {
      const products = await ProductRepo.findByStatus(String(status) as any);
      res.json({ data: products, count: products.length });
      return;
    }

    const products = await ProductRepo.listAll(Number(limit), Number(offset));
    const count = await ProductRepo.count();
    res.json({ data: products, count });
  } catch (error) {
    logger.error(`GET /products error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product with all related data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await ProductRepo.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const [suppliers, marketPrices, score, pricing, content] = await Promise.all([
      SupplierOfferRepo.findByProductId(req.params.id),
      MarketPriceRepo.getSummary(req.params.id),
      ProductScoreRepo.findByProductId(req.params.id),
      PricingRepo.findByProductId(req.params.id),
      ContentRepo.findByProductId(req.params.id),
    ]);

    res.json({
      data: {
        product,
        suppliers,
        market_summary: marketPrices,
        score,
        pricing,
        content,
      },
    });
  } catch (error) {
    logger.error(`GET /products/:id error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});

// Bulk rebuild missing export metadata (must be before /:id routes)
router.post('/rebuild-missing-export-data', async (_req: Request, res: Response) => {
  try {
    logger.info('[rebuild-bulk] starting bulk rebuild of missing export metadata');
    const result = await rebuildMissingExportData();
    res.json(result);
  } catch (error: any) {
    logger.error(`POST /products/rebuild-missing-export-data error: ${error}`);
    res.status(500).json({ success: false, error: 'Bulk rebuild failed', details: error?.message });
  }
});

// Run discovery pipeline
router.post('/discover', async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;
    const ids = await orchestrator.runDiscoveryOnly(keywords);
    res.json({ data: { discovered: ids.length, product_ids: ids } });
  } catch (error) {
    logger.error(`POST /products/discover error: ${error}`);
    res.status(500).json({ error: 'Discovery failed' });
  }
});

// Run full pipeline
router.post('/pipeline', async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;
    const result = await orchestrator.runFullPipeline(keywords);
    res.json({ data: result });
  } catch (error) {
    logger.error(`POST /products/pipeline error: ${error}`);
    res.status(500).json({ error: 'Pipeline failed' });
  }
});

// Analyze a specific product
router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    await orchestrator.analyzeProduct(req.params.id);
    res.json({ data: { status: 'analyzed', product_id: req.params.id } });
  } catch (error) {
    logger.error(`POST /products/:id/analyze error: ${error}`);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Generate Arabic content
router.post('/:id/content', async (req: Request, res: Response) => {
  try {
    const content = await contentGenerator.generateContent(req.params.id);
    res.json({ data: content });
  } catch (error) {
    logger.error(`POST /products/:id/content error: ${error}`);
    res.status(500).json({ error: 'Content generation failed' });
  }
});

// Prepare marketing assets
router.post('/:id/marketing', async (req: Request, res: Response) => {
  try {
    const assets = await marketingService.prepareAssets(req.params.id);
    res.json({ data: assets });
  } catch (error) {
    logger.error(`POST /products/:id/marketing error: ${error}`);
    res.status(500).json({ error: 'Marketing prep failed' });
  }
});

// Approve product
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { reviewed_by, notes } = req.body;
    await approvalService.approveProduct(req.params.id, reviewed_by, notes);
    res.json({ data: { status: 'approved', product_id: req.params.id } });
  } catch (error) {
    logger.error(`POST /products/:id/approve error: ${error}`);
    res.status(500).json({ error: 'Approval failed' });
  }
});

// Reject product
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { reviewed_by, notes } = req.body;
    await approvalService.rejectProduct(req.params.id, reviewed_by, notes);
    res.json({ data: { status: 'rejected', product_id: req.params.id } });
  } catch (error) {
    logger.error(`POST /products/:id/reject error: ${error}`);
    res.status(500).json({ error: 'Rejection failed' });
  }
});

// Rebuild export metadata for a single product
router.post('/:id/rebuild-export-data', async (req: Request, res: Response) => {
  try {
    logger.info(`[rebuild] rebuilding export data for product ${req.params.id}`);
    const result = await rebuildExportData(req.params.id);
    if (!result.success && result.error?.includes('not found')) {
      res.status(404).json(result);
      return;
    }
    if (!result.success) {
      res.status(500).json(result);
      return;
    }
    res.json(result);
  } catch (error: any) {
    logger.error(`POST /products/:id/rebuild-export-data error: ${error}`);
    res.status(500).json({ success: false, product_id: req.params.id, error: 'Rebuild failed', details: error?.message });
  }
});

// Push approved product to Salla
router.post('/:id/push-to-salla', async (req: Request, res: Response) => {
  try {
    const result = await approvalService.pushToSalla(req.params.id);
    res.json({ data: result });
  } catch (error) {
    logger.error(`POST /products/:id/push-to-salla error: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Get products pending review
router.get('/review/pending', async (_req: Request, res: Response) => {
  try {
    const products = await approvalService.getProductsForReview();
    res.json({ data: products });
  } catch (error) {
    logger.error(`GET /products/review/pending error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch pending products' });
  }
});

export default router;
