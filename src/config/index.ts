import dotenv from 'dotenv';
import { z } from 'zod';
import { PricingConfig, ScoringWeights } from '../types';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('saudi_dropshipping'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.coerce.boolean().default(false),

  SALLA_CLIENT_ID: z.string().default(''),
  SALLA_CLIENT_SECRET: z.string().default(''),
  SALLA_REDIRECT_URI: z.string().default('http://localhost:3000/api/v1/salla/callback'),
  SALLA_ACCESS_TOKEN: z.string().default(''),
  SALLA_REFRESH_TOKEN: z.string().default(''),
  SALLA_STORE_ID: z.string().default(''),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  ANTHROPIC_API_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),

  ALIEXPRESS_APP_KEY: z.string().default(''),
  ALIEXPRESS_APP_SECRET: z.string().default(''),
  ALIEXPRESS_ACCESS_TOKEN: z.string().default(''),
  ALIBABA_APP_KEY: z.string().default(''),
  ALIBABA_APP_SECRET: z.string().default(''),

  ADMIN_API_KEY: z.string().default('changeme'),
  JWT_SECRET: z.string().default('changeme'),

  N8N_WEBHOOK_URL: z.string().default('http://localhost:5678'),
  N8N_API_KEY: z.string().default(''),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  ENABLE_AUTO_PUSH_TO_SALLA: z.coerce.boolean().default(false),
  REQUIRE_APPROVAL: z.coerce.boolean().default(true),
  ENABLE_MARKETING_QUEUE: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const pricingConfig: PricingConfig = {
  target_margin_pct: 35,
  minimum_margin_pct: 20,
  vat_rate: 0.15,
  vat_enabled: true,
  platform_fee_pct: 2.5,
  default_shipping_sar: 25,
  usd_to_sar_rate: 3.75,
  ad_spend_safety_factor: 0.6,
};

export const scoringWeights: ScoringWeights = {
  trend: 0.20,
  demand: 0.20,
  margin: 0.15,
  shipping: 0.10,
  virality: 0.15,
  competition: 0.10,
  supplier_trust: 0.10,
};

export default env;
