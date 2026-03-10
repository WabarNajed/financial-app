import dotenv from 'dotenv';
import { z } from 'zod';
import { PricingConfig, ScoringWeights } from '../types';

dotenv.config();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Core app
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database (PostgreSQL) — optional: app can start without DB
  DATABASE_URL: z.string().default(''),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('saudi_dropshipping'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.coerce.boolean().default(false),

  // Salla Merchant API
  SALLA_CLIENT_ID: z.string().default(''),
  SALLA_CLIENT_SECRET: z.string().default(''),
  SALLA_REDIRECT_URI: z.string().default('http://localhost:3000/api/v1/salla/callback'),
  SALLA_ACCESS_TOKEN: z.string().default(''),
  SALLA_REFRESH_TOKEN: z.string().default(''),
  SALLA_STORE_ID: z.string().default(''),

  // LLM
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  ANTHROPIC_API_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),

  // Supplier APIs
  ALIEXPRESS_APP_KEY: z.string().default(''),
  ALIEXPRESS_APP_SECRET: z.string().default(''),
  ALIEXPRESS_ACCESS_TOKEN: z.string().default(''),
  ALIBABA_APP_KEY: z.string().default(''),
  ALIBABA_APP_SECRET: z.string().default(''),
  RAPIDAPI_KEY: z.string().default(''),
  RAPIDAPI_HOST: z.string().default('alibaba-datahub.p.rapidapi.com'),

  // Admin auth
  ADMIN_API_KEY: z.string().default('changeme'),
  JWT_SECRET: z.string().default('changeme'),

  // n8n
  N8N_WEBHOOK_URL: z.string().default('http://localhost:5678'),
  N8N_API_KEY: z.string().default(''),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Discovery tuning
  DISCOVERY_MIN_RELEVANCE: z.coerce.number().default(55),
  DISCOVERY_MARKETING_MIN_SCORE: z.coerce.number().default(70),

  // Feature flags
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

// ---------------------------------------------------------------------------
// Integration status helpers (used by health check & startup diagnostics)
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  name: string;
  status: 'active' | 'fallback' | 'inactive';
  detail: string;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const statuses: IntegrationStatus[] = [];

  // Database
  const hasDb = !!(env.DATABASE_URL || env.DB_PASSWORD);
  statuses.push({
    name: 'PostgreSQL',
    status: hasDb ? 'active' : 'inactive',
    detail: hasDb ? `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}` : 'No DB_PASSWORD or DATABASE_URL set',
  });

  // LLM
  const hasOpenAI = !!env.OPENAI_API_KEY;
  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  statuses.push({
    name: 'LLM (Content Generation)',
    status: hasOpenAI || hasAnthropic ? 'active' : 'fallback',
    detail: hasOpenAI ? `OpenAI (${env.OPENAI_MODEL})` : hasAnthropic ? 'Anthropic' : 'Deterministic fallback — no API key',
  });

  // Salla
  const hasSalla = !!(env.SALLA_CLIENT_ID && env.SALLA_ACCESS_TOKEN);
  statuses.push({
    name: 'Salla Store',
    status: hasSalla ? 'active' : 'inactive',
    detail: hasSalla ? 'Connected' : 'Missing SALLA_CLIENT_ID or SALLA_ACCESS_TOKEN',
  });

  // AliExpress
  const hasAliExpress = !!env.ALIEXPRESS_APP_KEY;
  const hasRapidApi = !!env.RAPIDAPI_KEY;
  statuses.push({
    name: 'AliExpress',
    status: hasAliExpress ? 'active' : hasRapidApi ? 'active' : 'fallback',
    detail: hasAliExpress ? 'Official API' : hasRapidApi ? 'RapidAPI' : 'Mock fallback pool',
  });

  // Alibaba
  const hasAlibaba = !!env.ALIBABA_APP_KEY;
  statuses.push({
    name: 'Alibaba',
    status: hasAlibaba ? 'active' : 'fallback',
    detail: hasAlibaba ? 'Official API' : 'Scraping fallback',
  });

  // n8n
  const hasN8n = !!env.N8N_API_KEY;
  statuses.push({
    name: 'n8n Automation',
    status: hasN8n ? 'active' : 'inactive',
    detail: hasN8n ? env.N8N_WEBHOOK_URL : 'No N8N_API_KEY set',
  });

  // Auth security warning
  if (env.ADMIN_API_KEY === 'changeme' || env.JWT_SECRET === 'changeme') {
    statuses.push({
      name: 'Security',
      status: 'fallback',
      detail: 'Using default dev credentials — change ADMIN_API_KEY and JWT_SECRET for production',
    });
  }

  return statuses;
}

export function printStartupDiagnostics(): void {
  const statuses = getIntegrationStatuses();

  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│       Saudi Dropshipping AI Agent — Diagnostics     │');
  console.log('├─────────────────────────────────────────────────────┤');

  for (const s of statuses) {
    const icon = s.status === 'active' ? '✓' : s.status === 'fallback' ? '~' : '✗';
    const tag = s.status.toUpperCase().padEnd(8);
    console.log(`│ ${icon} [${tag}] ${s.name.padEnd(22)} ${s.detail.slice(0, 30).padEnd(30)}│`);
  }

  console.log('└─────────────────────────────────────────────────────┘\n');
}

// ---------------------------------------------------------------------------
// Pricing & scoring config (unchanged)
// ---------------------------------------------------------------------------

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
