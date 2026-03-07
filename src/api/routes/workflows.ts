import { Router, Request, Response } from 'express';
import { WorkflowRepo } from '../../database/repositories';
import { OrchestratorService } from '../../services/orchestrator.service';
import { DiscoveryOrchestratorService } from '../../services/discovery-orchestrator.service';
import logger from '../../utils/logger';

const router = Router();
const orchestrator = new OrchestratorService();
const discovery = new DiscoveryOrchestratorService();

// Get recent workflow runs
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const runs = await WorkflowRepo.getRecent(limit);
    res.json({ data: runs });
  } catch (error) {
    logger.error(`GET /workflows error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch workflow runs' });
  }
});

// Trigger full pipeline
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;
    const result = await orchestrator.runFullPipeline(keywords);
    res.json({ data: result });
  } catch (error) {
    logger.error(`POST /workflows/run error: ${error}`);
    res.status(500).json({ error: 'Workflow failed' });
  }
});

// Analyze all pending (discovered) products
router.post('/analyze-pending', async (_req: Request, res: Response) => {
  try {
    const count = await orchestrator.runAnalysisForPending();
    res.json({ data: { analyzed: count } });
  } catch (error) {
    logger.error(`POST /workflows/analyze-pending error: ${error}`);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Live discovery across TikTok + Amazon + AliExpress
// Enhanced: relevance filtering, DB persistence, marketing generation
router.post('/discover-live', async (req: Request, res: Response) => {
  try {
    const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
    const save = req.body?.save !== false;
    const generateMarketing = req.body?.generateMarketing !== false;

    const result = await discovery.discoverLive({
      keywords,
      save,
      generateMarketing,
    });

    res.json({ data: result });
  } catch (error) {
    logger.error(`POST /workflows/discover-live error: ${error}`);
    res.status(500).json({ error: 'Live discovery failed' });
  }
});

export default router;
