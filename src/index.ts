import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config';
import { testConnection } from './database/connection';
import { adminAuth } from './api/middleware/auth';
import productRoutes from './api/routes/products';
import workflowRoutes from './api/routes/workflows';
import marketingRoutes from './api/routes/marketing';
import sallaRoutes from './api/routes/salla';
import dashboardRoutes from './api/routes/dashboard';
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

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (authenticated)
const api = express.Router();
api.use(adminAuth);
api.use('/products', productRoutes);
api.use('/workflows', workflowRoutes);
api.use('/marketing', marketingRoutes);
api.use('/salla', sallaRoutes);
api.use('/dashboard', dashboardRoutes);

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
  const dbReady = await testConnection();
  if (!dbReady) {
    logger.warn('Database not available. API will start but database operations will fail.');
  }

  app.listen(env.PORT, () => {
    logger.info(`Saudi Dropshipping Agent API running on port ${env.PORT}`);
    logger.info(`API prefix: ${env.API_PREFIX}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

export default app;
