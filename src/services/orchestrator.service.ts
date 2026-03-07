import { ProductDiscoveryEngine } from '../engines/discovery';
import { SupplierMatchingEngine } from '../engines/supplier';
import { MarketComparisonEngine } from '../engines/market';
import { PricingEngine } from '../engines/pricing';
import { ProductScoringEngine } from '../engines/scoring';
import { ProductRepo, WorkflowRepo, ApprovalRepo } from '../database/repositories';
import { env } from '../config';
import logger from '../utils/logger';

/**
 * Orchestrates the full product analysis pipeline:
 * Discovery -> Supplier Matching -> Market Comparison -> Pricing -> Scoring -> Approval Queue
 */
export class OrchestratorService {
  private discovery: ProductDiscoveryEngine;
  private supplier: SupplierMatchingEngine;
  private market: MarketComparisonEngine;
  private pricing: PricingEngine;
  private scoring: ProductScoringEngine;

  constructor() {
    this.discovery = new ProductDiscoveryEngine();
    this.supplier = new SupplierMatchingEngine();
    this.market = new MarketComparisonEngine();
    this.pricing = new PricingEngine();
    this.scoring = new ProductScoringEngine();
  }

  async runFullPipeline(keywords?: string[]): Promise<{
    workflowRunId: string;
    productsDiscovered: number;
    productsAnalyzed: number;
    errors: string[];
  }> {
    const runId = await WorkflowRepo.create({
      workflow_name: 'full_pipeline',
      status: 'running',
      started_at: new Date(),
      products_processed: 0,
      errors: [],
    });

    const errors: string[] = [];
    let analyzed = 0;

    try {
      // Step 1: Discover products
      logger.info('Pipeline Step 1: Product Discovery');
      const productIds = await this.discovery.discoverAndSave(keywords);
      logger.info(`Discovered ${productIds.length} products`);

      // Step 2-5: Analyze each product
      for (const productId of productIds) {
        try {
          await this.analyzeProduct(productId);
          analyzed++;
        } catch (error) {
          const msg = `Analysis failed for product ${productId}: ${error}`;
          logger.error(msg);
          errors.push(msg);
        }
      }

      await WorkflowRepo.complete(runId, analyzed, errors);

      return {
        workflowRunId: runId,
        productsDiscovered: productIds.length,
        productsAnalyzed: analyzed,
        errors,
      };
    } catch (error) {
      const msg = `Pipeline failed: ${error}`;
      errors.push(msg);
      await WorkflowRepo.fail(runId, errors);
      throw error;
    }
  }

  async analyzeProduct(productId: string): Promise<void> {
    const product = await ProductRepo.findById(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    logger.info(`Analyzing product: ${product.name} (${productId})`);

    // Step 2: Find suppliers
    logger.info(`  -> Supplier matching for: ${product.name}`);
    await this.supplier.findAndSaveSuppliers(productId, product.name);

    // Step 3: Market price comparison
    logger.info(`  -> Market comparison for: ${product.name}`);
    await this.market.comparePrices(productId, product.name);

    // Step 4: Pricing calculation
    logger.info(`  -> Pricing calculation for: ${product.name}`);
    await this.pricing.calculateForProduct(productId);

    // Step 5: Scoring
    logger.info(`  -> Scoring for: ${product.name}`);
    await this.scoring.scoreProduct(productId);

    // Update status to analyzed
    await ProductRepo.updateStatus(productId, 'analyzed');
    await ApprovalRepo.updateStatus(productId, 'analyzed');

    logger.info(`Product ${productId} analysis complete`);
  }

  async runDiscoveryOnly(keywords?: string[]): Promise<string[]> {
    return this.discovery.discoverAndSave(keywords);
  }

  async runAnalysisForPending(): Promise<number> {
    const pending = await ProductRepo.findByStatus('discovered');
    let analyzed = 0;

    for (const product of pending) {
      try {
        await this.analyzeProduct(product.id!);
        analyzed++;
      } catch (error) {
        logger.error(`Failed to analyze product ${product.id}: ${error}`);
      }
    }

    return analyzed;
  }
}
