import { Router, Request, Response } from 'express';
import { ProductRepo, ProductScoreRepo, WorkflowRepo } from '../../database/repositories';
import { getDb } from '../../database/connection';
import logger from '../../utils/logger';

const router = Router();

// Dashboard summary stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const [
      totalProducts,
      statusCounts,
      topScored,
      recentWorkflows,
      avgScore,
    ] = await Promise.all([
      ProductRepo.count(),
      db('products').select('status').count('id as count').groupBy('status'),
      ProductScoreRepo.getTopProducts(5),
      WorkflowRepo.getRecent(5),
      db('product_scores').avg('final_score as avg_score').first(),
    ]);

    res.json({
      data: {
        total_products: totalProducts,
        status_breakdown: statusCounts.reduce((acc: any, row: any) => {
          acc[row.status] = Number(row.count);
          return acc;
        }, {}),
        top_products: topScored,
        recent_workflows: recentWorkflows,
        average_score: avgScore?.avg_score ? Math.round(Number(avgScore.avg_score) * 10) / 10 : null,
      },
    });
  } catch (error) {
    logger.error(`GET /dashboard/stats error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Products ranked by score
router.get('/rankings', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const db = getDb();

    const ranked = await db('product_scores')
      .join('products', 'products.id', 'product_scores.product_id')
      .select(
        'products.id',
        'products.name',
        'products.category',
        'products.status',
        'products.source',
        'product_scores.final_score',
        'product_scores.trend_score',
        'product_scores.margin_score',
        'product_scores.virality_score'
      )
      .orderBy('product_scores.final_score', 'desc')
      .limit(limit);

    res.json({ data: ranked });
  } catch (error) {
    logger.error(`GET /dashboard/rankings error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

export default router;
