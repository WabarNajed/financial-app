import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, printStartupDiagnostics, getIntegrationStatuses } from './config';
import { testConnection, isDatabaseAvailable } from './database/connection';
import { adminAuth } from './api/middleware/auth';
import productRoutes from './api/routes/products';
import workflowRoutes from './api/routes/workflows';
import marketingRoutes from './api/routes/marketing';
import sallaRoutes from './api/routes/salla';
import dashboardRoutes from './api/routes/dashboard';
import exportRoutes from './api/routes/export';
import adminRoutes from './api/routes/admin';
import orderRoutes from './api/routes/orders';
import integrationRoutes from './api/routes/integrations';
import webhookRoutes from './api/routes/webhooks';
import alertRoutes from './api/routes/alerts';
import communicationRoutes from './api/routes/communications';
import settingsRoutes from './api/routes/settings';
import logger from './utils/logger';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Health check (no auth) — includes DB and integration status
app.get('/health', async (_req, res) => {
  const dbUp = isDatabaseAvailable();
  const integrations = getIntegrationStatuses();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: dbUp ? 'connected' : 'unavailable',
    integrations: integrations.map((i) => ({
      name: i.name,
      status: i.status,
    })),
  });
});

// Also expose under API prefix for convenience
app.get(`${env.API_PREFIX}/health`, async (_req, res) => {
  const dbUp = isDatabaseAvailable();
  const integrations = getIntegrationStatuses();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: dbUp ? 'connected' : 'unavailable',
    integrations: integrations.map((i) => ({
      name: i.name,
      status: i.status,
    })),
  });
});

// API routes (authenticated)
const api = express.Router();
api.use(adminAuth);
api.use('/products', productRoutes);
api.use('/workflows', workflowRoutes);
api.use('/marketing', marketingRoutes);
api.use('/salla', sallaRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/export', exportRoutes);
api.use('/admin', adminRoutes);
api.use('/orders', orderRoutes);
api.use('/integrations', integrationRoutes);
api.use('/alerts', alertRoutes);
api.use('/communications', communicationRoutes);
api.use('/settings', settingsRoutes);

// Webhooks — no auth required (validated by webhook secret)
app.use(`${env.API_PREFIX}/webhooks`, webhookRoutes);

app.use(env.API_PREFIX, api);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  // Print startup diagnostics
  printStartupDiagnostics();

  const dbReady = await testConnection();
  if (!dbReady) {
    logger.warn('Database not available. API will start but database operations will fail gracefully.');
  }

  app.listen(env.PORT, () => {
    logger.info(`Saudi Dropshipping Agent API running on port ${env.PORT}`);
    logger.info(`API prefix: ${env.API_PREFIX}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Health check: http://localhost:${env.PORT}/health`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

export default app;
